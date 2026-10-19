// Status:: done
// task-relay.tmp state & handoff protocol manager.
// Strictly implements Claude Docs 07, 08, 11, and Sprint Plan §2G.
// Manages the active role-to-role communication file and Documenter handshake:
// 1. Role writes output to task-relay.tmp
// 2. Documenter immediately copies compact summary to raw.log
// 3. Documenter confirms copy back to relay.ts (Handshake Token)
// 4. Manager verifies confirmation before clearing relay and staging next brief.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getVectaDir } from "../interface/src/helpers/paths.js";
import {
  documenterPassiveCopy,
  type DocumenterConfirmation,
} from "../roles/documenter.js";

export type RelayCase =
  | "role_output"
  | "role_brief"
  | "planning_output"
  | "role_skipped"
  | "failsafe_handoff";

export interface RoleOutputRelay {
  case: "role_output";
  role: string;
  task: string;
  output: string;
  files_touched: string[];
  timestamp: string;
}

export interface RoleBriefRelay {
  case: "role_brief";
  target_role: string;
  brief: string;
  files_allowed: string[];
  user_request_summary: string;
  previous_role_summary: string;
  memory_snippets: string[];
  prompt?: string;
  timestamp: string;
}

export interface PlanningOutputRelay {
  case: "planning_output";
  role: string;
  planning_summary: string;
  tasks_identified: string[];
  timestamp: string;
}

export interface RoleSkippedRelay {
  case: "role_skipped";
  role: string;
  reason: string;
  partial_output: string;
  written_by: "Manager";
  note: string;
  timestamp: string;
}

export interface FailsafeHandoffRelay {
  case: "failsafe_handoff";
  manager_down: boolean;
  acting_as_manager: string;
  pipeline_position: number;
  remaining_pipeline: string[];
  timestamp: string;
}

export type TaskRelay =
  | RoleOutputRelay
  | RoleBriefRelay
  | PlanningOutputRelay
  | RoleSkippedRelay
  | FailsafeHandoffRelay;

/** In-memory handshake tracker per chat ensuring Manager cannot clear without Documenter confirmation */
const activeConfirmations = new Map<string, DocumenterConfirmation>();

/**
 * Sanitizes chatId to prevent directory traversal (fixes BUG-004).
 */
function sanitizeChatId(chatId: string): string {
  const clean = path.basename(chatId).replace(/[^a-zA-Z0-9_-]/g, "");
  return clean || "default";
}

/**
 * Gets the path to the task-relay.tmp file for a given chat.
 */
export function getRelayPath(chatId: string, customBaseDir?: string): string {
  const base = customBaseDir || getVectaDir();
  return path.join(base, "chats", sanitizeChatId(chatId), "task-relay.tmp");
}

/**
 * Writes a task-relay.tmp entry to disk and completes the Documenter handshake.
 * Returns the Documenter confirmation record.
 */
export async function writeRelay(
  chatId: string,
  entry: TaskRelay,
  customBaseDir?: string
): Promise<DocumenterConfirmation> {
  const cleanId = sanitizeChatId(chatId);
  const filePath = getRelayPath(cleanId, customBaseDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // 1. Role writes entry to task-relay.tmp
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");

  // 2. Trigger Documenter handshake (passive copy to raw.log)
  const confirmation = await documenterPassiveCopy(cleanId, entry, customBaseDir);

  // 3. Record confirmation in relay state
  activeConfirmations.set(cleanId, confirmation);

  return confirmation;
}

/**
 * Reads the current task-relay.tmp file.
 */
export async function readRelay(
  chatId: string,
  customBaseDir?: string
): Promise<TaskRelay | null> {
  const filePath = getRelayPath(chatId, customBaseDir);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as TaskRelay;
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Checks if Documenter has confirmed the handshake for the active relay entry.
 */
export function isRelayConfirmedByDocumenter(chatId: string): boolean {
  const cleanId = sanitizeChatId(chatId);
  const confirmation = activeConfirmations.get(cleanId);
  return !!confirmation && confirmation.status === "confirmed";
}

/**
 * Gets the last Documenter confirmation for a chat.
 */
export function getLastConfirmation(chatId: string): DocumenterConfirmation | null {
  const cleanId = sanitizeChatId(chatId);
  return activeConfirmations.get(cleanId) || null;
}

/**
 * Manager clears task-relay.tmp after reading role output.
 * STRICT LAW: Manager CANNOT clear task-relay.tmp until Documenter confirms (Doc 08 & 11).
 * If unconfirmed, throws an error and prevents file erasure.
 */
export async function clearRelay(
  chatId: string,
  customBaseDir?: string
): Promise<boolean> {
  const cleanId = sanitizeChatId(chatId);

  // Enforce handshake confirmation
  if (!isRelayConfirmedByDocumenter(cleanId)) {
    throw new Error(
      `Cannot clear task-relay.tmp for chat "${cleanId}": Documenter handshake not confirmed.`
    );
  }

  const filePath = getRelayPath(cleanId, customBaseDir);
  try {
    await fs.unlink(filePath);
    // Reset confirmation state after successful clear
    activeConfirmations.delete(cleanId);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      activeConfirmations.delete(cleanId);
      return true;
    }
    throw error;
  }
}
