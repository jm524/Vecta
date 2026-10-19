// Status:: done
// Manager duties state — manages .vecta/chats/[chat-id]/manager-duties.json.
// Strictly implements Claude Docs 04, 08, and 11.
// Tells any backup or failsafe role HOW to BE Manager if Manager goes down.
// Layer 1: Base permanent duties from roles/manager.ts.
// Layer 2: Rolling session context additions learned throughout the chat.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getVectaDir } from "../interface/src/helpers/paths.js";
import { defaultDuties } from "../roles/manager.js";

export interface ManagerDutiesData {
  chatId: string;
  layer1BaseDuties: string[]; // Permanent 9 core duties from manager.ts
  layer2SessionContext: string[]; // Rolling additions learned throughout the session
  updatedAt: string;
}

/**
 * Sanitizes chatId to prevent directory traversal (fixes BUG-004).
 */
function sanitizeChatId(chatId: string): string {
  const clean = path.basename(chatId).replace(/[^a-zA-Z0-9_-]/g, "");
  return clean || "default";
}

/**
 * Returns path to manager-duties.json for a given chat.
 */
export function getManagerDutiesPath(chatId: string, customBaseDir?: string): string {
  const base = customBaseDir || getVectaDir();
  const cleanId = sanitizeChatId(chatId);
  return path.join(base, "chats", cleanId, "manager-duties.json");
}

/**
 * Initializes manager-duties.json at the start of a chat (Message 1).
 * Writes Layer 1 base duties permanently.
 */
export async function initManagerDuties(
  chatId: string,
  customBaseDir?: string
): Promise<ManagerDutiesData> {
  const filePath = getManagerDutiesPath(chatId, customBaseDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const initialData: ManagerDutiesData = {
    chatId: sanitizeChatId(chatId),
    layer1BaseDuties: [...defaultDuties],
    layer2SessionContext: [],
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath, JSON.stringify(initialData, null, 2), "utf8");
  return initialData;
}

/**
 * Reads manager-duties.json for a chat.
 * Self-heals with Layer 1 default duties if the file is missing or corrupted.
 */
export async function readManagerDuties(
  chatId: string,
  customBaseDir?: string
): Promise<ManagerDutiesData> {
  const filePath = getManagerDutiesPath(chatId, customBaseDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ManagerDutiesData;

    return {
      chatId: sanitizeChatId(chatId),
      layer1BaseDuties: Array.isArray(parsed.layer1BaseDuties) && parsed.layer1BaseDuties.length > 0
        ? parsed.layer1BaseDuties
        : [...defaultDuties],
      layer2SessionContext: Array.isArray(parsed.layer2SessionContext)
        ? parsed.layer2SessionContext
        : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return initManagerDuties(chatId, customBaseDir);
    }
    return {
      chatId: sanitizeChatId(chatId),
      layer1BaseDuties: [...defaultDuties],
      layer2SessionContext: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Appends a new session context note to Layer 2 of manager-duties.json.
 * If Layer 2 exceeds 50 entries, lightly compacts oldest entries to keep the file lean.
 */
export async function appendManagerContext(
  chatId: string,
  contextNote: string,
  customBaseDir?: string
): Promise<ManagerDutiesData> {
  const trimmed = contextNote.trim();
  if (!trimmed) {
    return readManagerDuties(chatId, customBaseDir);
  }

  const data = await readManagerDuties(chatId, customBaseDir);
  data.layer2SessionContext.push(trimmed);

  // Light compaction of Layer 2 if session runs very long (> 50 entries)
  if (data.layer2SessionContext.length > 50) {
    const retained = data.layer2SessionContext.slice(-30);
    const compactedSummary = `[Compacted summary: ${data.layer2SessionContext.length - 30} earlier session notes summarized.]`;
    data.layer2SessionContext = [compactedSummary, ...retained];
  }

  data.updatedAt = new Date().toISOString();

  const filePath = getManagerDutiesPath(chatId, customBaseDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");

  return data;
}

/**
 * Clears Layer 2 session context additions on new chat while preserving Layer 1 permanently.
 */
export async function clearSessionDuties(
  chatId: string,
  customBaseDir?: string
): Promise<ManagerDutiesData> {
  const data = await readManagerDuties(chatId, customBaseDir);
  data.layer2SessionContext = [];
  data.updatedAt = new Date().toISOString();

  const filePath = getManagerDutiesPath(chatId, customBaseDir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return data;
}

/**
 * Assembles and formats Layer 1 and Layer 2 into an authoritative briefing string
 * for any failsafe role (e.g. Planner, Code Reviewer) stepping in to act as Manager.
 */
export async function getDutiesForFailsafe(
  chatId: string,
  customBaseDir?: string
): Promise<string> {
  const data = await readManagerDuties(chatId, customBaseDir);

  const lines: string[] = [
    "=== VECTA MANAGER DUTIES — AUTHORITATIVE FAILSAFE BRIEFING ===",
    "",
    "LAYER 1: CORE PERMANENT DUTIES (NEVER VIOLATE):",
    ...data.layer1BaseDuties.map((d) => `  ${d}`),
    "",
    "LAYER 2: ACTIVE SESSION DISCOVERIES & CONTEXT:",
  ];

  if (data.layer2SessionContext.length === 0) {
    lines.push("  (No session-specific additions recorded yet)");
  } else {
    for (const note of data.layer2SessionContext) {
      lines.push(`  - ${note}`);
    }
  }

  lines.push("");
  lines.push("=== END MANAGER DUTIES ===");

  return lines.join("\n");
}
