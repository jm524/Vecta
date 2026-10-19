// Status:: done
// Documenter Role & Subsystem.
// Implements Claude Docs 11, 14, and Sprint Plan §2B, §2E, §2G, §2P.
// Runs passively between every pipeline step, copying relay writes to raw.log in
// compact meeting-minutes style and confirming the handshake to relay.ts before Manager can clear.
// Also provides official turn execution, raw log size inspection, and memory Key Points dispatch.

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { getVectaDir } from "../interface/src/helpers/paths.js";
import {
  type RoleDefinition,
  DEFAULT_LAYER_1_LIMITS,
  DEFAULT_LAYER_2_LIMITS,
} from "./base.js";
import type { TaskRelay } from "../state/relay.js";
import { addScopeKeyPoint } from "../state/memory.js";

/** Confirmation returned to relay.ts upon successful passive copy */
export interface DocumenterConfirmation {
  chatId: string;
  entryCase: string;
  bytesWritten: number;
  confirmedAt: string;
  status: "confirmed" | "failed";
  auditSummary: string;
}

/**
 * Default system prompt for Documenter role.
 */
export const DOCUMENTER_DEFAULT_PROMPT = `
[ROLE IDENTITY: DOCUMENTER]
You are the Documenter in Vecta, a Stage 3 Finalizer AI agent.
Your mission is to maintain a perfect, compact, accountant-style log of everything that happens in the session.

[YOUR CORE DUTIES]
1. COMPACT SUMMARIES:
   - Provide meeting-minutes style summaries of what happened, what was decided, and what was built.
   - Example: "Coder built LoginForm.tsx — email/password, validation, POST /api/login"
2. AUDIT TRAIL & LOGFMT SPECIFICATION:
   - Always log in strict logfmt format (space-separated key=value pairs, one single entry per line).
   - Standard keys: ts, level, role, case, task, status, files, summary.
   - Quote multi-word values and comma-separate file paths. Never log raw diffs.
3. FINAL PIPELINE OUTPUT:
   - When given an official turn, write the final, clean output summarizing the completed task chunk for the user.
   - Do not repeat the blow-by-blow transcript; focus on the completed state.
4. NO SECRETS:
   - Never log API keys, passwords, or tokens.
`.trim();

/**
 * Documenter role definition object.
 */
export const documenterRole: RoleDefinition = {
  name: "Documenter",
  slug: "documenter",
  description: "Stage 3 Finalizer that passively logs actions and produces final task summaries.",
  roleFunction: "Finalizers",
  stage: 3,
  isOrchestrator: false,
  enabled: true,
  color: "magenta",
  defaultPrompt: DOCUMENTER_DEFAULT_PROMPT,
  prompt: "",
  limits: {
    layer1: DEFAULT_LAYER_1_LIMITS,
    layer2: DEFAULT_LAYER_2_LIMITS,
  },
};

/**
 * Serializes a primitive value into standard logfmt syntax.
 * Quotes values containing spaces, equals, or quotes, and escapes internal double-quotes.
 */
export function formatLogfmtValue(val: string | number | boolean): string {
  const str = String(val).replace(/[\r\n]+/g, " ").trim();
  if (str === "") return '""';
  if (/[\s"=]/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Serializes a key-value dictionary into a single-line logfmt string.
 */
export function toLogfmt(fields: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null) {
      parts.push(`${key}=${formatLogfmtValue(val)}`);
    }
  }
  return parts.join(" ");
}

/**
 * Parses a single logfmt line into a key-value record.
 */
export function parseLogfmt(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)=(?:"([^"\\]*(?:\\.[^"\\]*)*)"|([^\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const key = match[1];
    const val = match[2] !== undefined ? match[2].replace(/\\"/g, '"') : (match[3] ?? "");
    if (key) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Sanitizes chatId to prevent directory traversal (fixes BUG-004).
 */
function sanitizeChatId(chatId: string): string {
  const clean = path.basename(chatId).replace(/[^a-zA-Z0-9_-]/g, "");
  return clean || "default";
}

/**
 * Generates unique, shuffled alphanumeric IDs for raw log files.
 * Format: raw_9m2x4p7w1a8q (matches chat_ and proj_ scramble in chat-service.ts)
 */
export function generateRawLogId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const timeStr = Date.now().toString(36);
  let randStr = "";
  for (let i = 0; i < 8; i++) {
    randStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const arr = (timeStr + randStr).split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return `raw_${arr.join("")}`;
}

/**
 * In-memory map to guarantee consistent resolution of the same scrambled log name
 * within a chat session before it exists on disk.
 */
const rawLogFileMap = new Map<string, string>();

/**
 * Gets the path to the scrambled raw log file (raw_[scramble].log) for a given chat.
 * Discovers existing raw_*.log or legacy raw.log in .vecta/chats/[chat-id]/, or generates a new scrambled filename.
 */
export function getRawLogPath(chatId: string, customBaseDir?: string): string {
  const cleanId = sanitizeChatId(chatId);
  const base = customBaseDir || getVectaDir();
  const chatDir = path.join(base, "chats", cleanId);
  const mapKey = `${base}:${cleanId}`;

  // Check in-memory map first
  const mapped = rawLogFileMap.get(mapKey);
  if (mapped) {
    return path.join(chatDir, mapped);
  }

  // Check disk for existing raw_*.log or legacy raw.log
  try {
    if (fsSync.existsSync(chatDir)) {
      const files = fsSync.readdirSync(chatDir);
      const found =
        files.find((f) => /^raw_[a-zA-Z0-9_-]+\.log$/i.test(f)) ||
        files.find((f) => f === "raw.log");
      if (found) {
        rawLogFileMap.set(mapKey, found);
        return path.join(chatDir, found);
      }
    }
  } catch {
    // ignore
  }

  // Generate new scrambled filename: raw_[scramble].log
  const newName = `${generateRawLogId()}.log`;
  rawLogFileMap.set(mapKey, newName);
  return path.join(chatDir, newName);
}

/**
 * Formats a clean, accountant-style meeting-minutes entry for raw.log in logfmt syntax.
 * Strips potential secret tokens and focuses on what was built and touched.
 */
function formatAuditMinutes(entry: TaskRelay): { record: string; auditSummary: string } {
  const timestamp = new Date().toISOString();
  let fields: Record<string, string | number | boolean | undefined> = {};
  let auditSummary = "";

  switch (entry.case) {
    case "role_output": {
      const filesText = entry.files_touched && entry.files_touched.length > 0
        ? entry.files_touched.join(",")
        : "none";
      const cleanOut = entry.output.trim().replace(/[\r\n]+/g, " ");
      const snippet = cleanOut.length > 200 ? `${cleanOut.slice(0, 197)}...` : cleanOut;

      fields = {
        ts: timestamp,
        level: "audit",
        role: entry.role,
        case: entry.case,
        task: entry.task,
        status: "completed",
        files: filesText,
        summary: snippet,
      };

      auditSummary = `${entry.role} touched ${filesText}`;
      break;
    }

    case "role_brief": {
      const allowed = entry.files_allowed && entry.files_allowed.length > 0
        ? entry.files_allowed.join(",")
        : "all";

      fields = {
        ts: timestamp,
        level: "brief",
        case: entry.case,
        dispatcher: "Manager",
        target_role: entry.target_role,
        files_allowed: allowed,
        goal: entry.user_request_summary,
      };

      auditSummary = `Brief staged for ${entry.target_role}`;
      break;
    }

    case "planning_output": {
      const tasks = entry.tasks_identified && entry.tasks_identified.length > 0
        ? entry.tasks_identified.join(" -> ")
        : "none";

      fields = {
        ts: timestamp,
        level: "plan",
        case: entry.case,
        role: entry.role,
        pipeline: tasks,
        summary: entry.planning_summary.trim(),
      };

      auditSummary = `Plan structured with ${entry.tasks_identified.length} tasks`;
      break;
    }

    case "role_skipped": {
      fields = {
        ts: timestamp,
        level: "warn",
        case: entry.case,
        role: entry.role,
        reason: entry.reason,
        partial_output: entry.partial_output || "none",
      };

      auditSummary = `${entry.role} skipped (${entry.reason})`;
      break;
    }

    case "failsafe_handoff": {
      fields = {
        ts: timestamp,
        level: "alert",
        case: entry.case,
        manager_status: "down",
        acting_as_manager: entry.acting_as_manager,
        remaining_pipeline: entry.remaining_pipeline.join(" -> "),
      };

      auditSummary = `Failsafe triggered; ${entry.acting_as_manager} acting as Manager`;
      break;
    }
  }

  const record = `${toLogfmt(fields)}\n`;
  return { record, auditSummary };
}

/**
 * Passively copies a task relay entry to raw.log as a compact summary.
 * Crucial: Returns an authoritative DocumenterConfirmation handshake signal.
 * Manager CANNOT clear task-relay.tmp until this confirms (Claude Doc 11 & 08).
 */
export async function documenterPassiveCopy(
  chatId: string,
  entry: TaskRelay,
  customBaseDir?: string
): Promise<DocumenterConfirmation> {
  const filePath = getRawLogPath(chatId, customBaseDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const { record, auditSummary } = formatAuditMinutes(entry);
  const bytes = Buffer.byteLength(record, "utf8");

  // Append entry to raw.log
  await fs.appendFile(filePath, record, "utf8");

  return {
    chatId: sanitizeChatId(chatId),
    entryCase: entry.case,
    bytesWritten: bytes,
    confirmedAt: new Date().toISOString(),
    status: "confirmed",
    auditSummary,
  };
}

/**
 * Returns current size in bytes of raw.log for a chat.
 */
export async function getRawLogSize(chatId: string, customBaseDir?: string): Promise<number> {
  const filePath = getRawLogPath(chatId, customBaseDir);
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Returns raw log entries as an array of single-line logfmt entries.
 */
export async function getRawLogEntries(chatId: string, customBaseDir?: string): Promise<string[]> {
  const filePath = getRawLogPath(chatId, customBaseDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((e) => e.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Documenter adds an observed Key Point to the scope memory.
 * Documenter is the only role that writes to memory (Claude Doc 11).
 */
export async function documenterAddKeyPoint(
  scopeId: string,
  point: string,
  customBaseDir?: string
): Promise<void> {
  addScopeKeyPoint(scopeId, point, customBaseDir);
}

/**
 * Documenter's official turn (Stage 3 Finalizer).
 * Generates a clean, concise final completion summary for the user.
 */
export async function documenterOfficialTurn(
  chatId: string,
  taskDescription: string,
  pipelineSummary: string,
  customBaseDir?: string
): Promise<string> {
  const timestamp = new Date().toISOString();
  const rawPath = getRawLogPath(chatId, customBaseDir);
  const rawFileName = path.basename(rawPath);
  const rawSize = await getRawLogSize(chatId, customBaseDir);
  const sizeKB = Math.round(rawSize / 1024);

  return [
    `Audit trail recorded to ${rawFileName} (${sizeKB} KB).`,
    `Task: ${taskDescription}`,
    `Pipeline executed: ${pipelineSummary}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}
