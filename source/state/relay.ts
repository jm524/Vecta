import * as fs from "node:fs/promises";
import * as path from "node:path";

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

/**
 * Gets the path to the task-relay.tmp file for a given chat.
 */
function getRelayPath(chatId: string): string {
  // We assume the CWD is the project root, where .vecta is stored.
  return path.join(process.cwd(), ".vecta", "chats", chatId, "task-relay.tmp");
}

/**
 * Writes a task-relay.tmp entry to disk.
 * Handles the Documenter passive copy handshake before resolving.
 */
export async function writeRelay(chatId: string, entry: TaskRelay): Promise<void> {
  const filePath = getRelayPath(chatId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // 1. Write role output entry to task-relay.tmp
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");

  // 2. Trigger Documenter handshake (copy to raw.log)
  // This imports the Documenter's passive function dynamically to avoid circular dependencies,
  // or Documenter is just imported. 
  const { documenterPassiveCopy } = await import("../roles/documenter.js");

  // 3. Wait for Documenter confirmation
  await documenterPassiveCopy(chatId, entry);

  // 4. Signal Manager to read and clear (this happens implicitly since writeRelay resolves)
}

/**
 * Reads the task-relay.tmp file.
 */
export async function readRelay(chatId: string): Promise<TaskRelay | null> {
  const filePath = getRelayPath(chatId);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as TaskRelay;
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Manager clears the task-relay.tmp file after reading.
 */
export async function clearRelay(chatId: string): Promise<void> {
  const filePath = getRelayPath(chatId);
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
}

/**
 * Manager writes the next role's brief into the cleared relay file.
 * This does NOT trigger the Documenter handshake because it's a brief, not output.
 * Wait, Doc 08: "Role writes output -> Documenter copies -> Documenter confirms -> Manager clears task-relay.tmp -> Manager writes next role's brief".
 * Should Documenter copy the brief too? Doc 11 says "Documenter copies relay entries passively".
 * Let's assume writeRelay handles all writes and triggers passive copy if needed.
 * Doc 08: "Role writes -> Documenter copies to raw.log (compact summary) -> Documenter confirms to relay.ts -> Manager CANNOT clear task-relay.tmp until Documenter confirms"
 */
