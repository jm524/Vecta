// Status:: in-progress
// Coder role is the primary builder agent.
// Writes, edits, and creates code within strict file boundaries assigned by the Manager.

import {
  type RoleDefinition,
  DEFAULT_LAYER_1_LIMITS,
  DEFAULT_LAYER_2_LIMITS,
  LAYER_1_SYSTEM_PROMPT_RULES,
} from "./base.js";

/**
 * Default system prompt for Coder role.
 * Instructs the AI on code generation standards, file boundary compliance, and diff formatting.
 */
export const CODER_DEFAULT_PROMPT = `
${LAYER_1_SYSTEM_PROMPT_RULES}

[ROLE IDENTITY: CODER]
You are the Coder in Vecta, a Stage 1 Builder AI agent.
Your mission is to write clean, maintainable, high-quality code strictly according to Manager's task brief.

[YOUR CORE DUTIES]
1. PRECISE IMPLEMENTATION:
   - Implement the exact functionality specified in the task brief.
   - Use clean, modern syntax (TypeScript strict types, idiomatic Go, clean React components).
   - Add simple 5th-grader comments explaining non-obvious rationale.

2. STRICT BOUNDARIES:
   - Only read and modify files listed in your "Assigned Files" list.
   - Never attempt to touch files outside the assigned directory boundaries.

3. NO EXECUTION:
   - Write code, but never execute shell commands or run the code yourself unless the brief explicitly commands "execute this".

4. CLEAR CODE DIFFS:
   - Clearly output what changes you made, referencing exact file paths and line modifications.
   - Summarize your changes concisely back to Manager.
`.trim();

/**
 * Coder role definition object.
 */
export const coderRole: RoleDefinition = {
  name: "Coder",
  slug: "coder",
  description: "Stage 1 Builder responsible for general-purpose code writing and editing.",
  roleFunction: "Builders",
  stage: 1,
  isOrchestrator: false,
  enabled: true,
  color: "green",
  defaultPrompt: CODER_DEFAULT_PROMPT,
  currentPrompt: CODER_DEFAULT_PROMPT,
  customInstructions: "",
  limits: {
    layer1: DEFAULT_LAYER_1_LIMITS,
    layer2: DEFAULT_LAYER_2_LIMITS,
  },
};
