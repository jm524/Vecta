import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type RoleDefinition,
  DEFAULT_LAYER_1_LIMITS,
  DEFAULT_LAYER_2_LIMITS,
  LAYER_1_SYSTEM_PROMPT_RULES,
} from "./base.js";
import { type TaskRelay } from "../state/relay.js";

/**
 * Default system prompt for Documenter role.
 */
export const DOCUMENTER_DEFAULT_PROMPT = `
${LAYER_1_SYSTEM_PROMPT_RULES}

[ROLE IDENTITY: DOCUMENTER]
You are the Documenter in Vecta, a Stage 3 Finalizer AI agent.
Your mission is to maintain a perfect, compact, accountant-style log of everything that happens in the session.

[YOUR CORE DUTIES]
1. COMPACT SUMMARIES:
   - Provide meeting-minutes style summaries of what happened, what was decided, and what was built.
   - Example: "Coder built LoginForm.tsx — email/password, validation, POST /api/login"
2. AUDIT TRAIL:
   - Always log exactly which files were touched (read or written) by which roles.
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
  currentPrompt: DOCUMENTER_DEFAULT_PROMPT,
  customInstructions: "",
  limits: {
    layer1: DEFAULT_LAYER_1_LIMITS,
    layer2: DEFAULT_LAYER_2_LIMITS,
  },
};

/**
 * Gets the path to the raw.log file for a given chat.
 */
function getRawLogPath(chatId: string): string {
  return path.join(process.cwd(), ".vecta", "chats", chatId, "raw.log");
}

/**
 * Passively copies a task relay entry to raw.log as a compact summary.
 * For Day 6 (Oct 9) implementation, we build the plain file-based handshake.
 * Later (Step 5+6) this will involve crypto encryption-on-write and AI summarization.
 */
export async function documenterPassiveCopy(chatId: string, entry: TaskRelay): Promise<void> {
  const filePath = getRawLogPath(chatId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Format a basic accountant-style summary based on the entry type.
  // Future: This could trigger a fast local AI call for true summarization.
  let summary = "";
  const timestamp = new Date().toISOString();

  switch (entry.case) {
    case "role_output":
      summary = `[${timestamp}] ${entry.role} finished task: "${entry.task}". Files touched: ${entry.files_touched.join(", ")}`;
      // We also include a truncated portion of the output to simulate the compact summary
      summary += `\nDetails: ${entry.output.substring(0, 150)}${entry.output.length > 150 ? "..." : ""}\n`;
      break;
    case "role_brief":
      summary = `[${timestamp}] Manager dispatched ${entry.target_role}. Goal: ${entry.user_request_summary}\n`;
      break;
    case "planning_output":
      summary = `[${timestamp}] ${entry.role} identified tasks: ${entry.tasks_identified.join(", ")}\n`;
      break;
    case "role_skipped":
      summary = `[${timestamp}] ${entry.role} skipped. Reason: ${entry.reason}\n`;
      break;
    case "failsafe_handoff":
      summary = `[${timestamp}] FAILSAFE ACTIVE. Manager down. ${entry.acting_as_manager} acting as Manager.\n`;
      break;
  }

  // Append to raw.log (unencrypted for now, Step 5+6 will add crypto.go bridge)
  await fs.appendFile(filePath, summary, "utf-8");
}
