// Status:: in-progress
// Planner role is the Stage 0 Orchestrator active in Planning mode.
// Listens to user ideas, builds architectural breakdowns, and serves as emergency backup if Manager fails.
// Planner never writes code or touches files directly.

import {
  type RoleDefinition,
  DEFAULT_LAYER_1_LIMITS,
  DEFAULT_LAYER_2_LIMITS,
} from "./base.js";

/**
 * Base responsibilities for Planner if stepping into Manager backup duties (Doc 09 Failsafe).
 */
export const plannerDuties: string[] = [
  "1. ARCHITECTURE BREAKDOWN: Deconstruct high-level ideas into modular subsystems and task steps.",
  "2. FEASIBILITY ANALYSIS: Identify technical dependencies and potential architectural risks.",
  "3. ROLE ASSIGNMENT ADVICE: Advise which specialized roles will handle each phase in implementation.",
  "4. FAILSAFE BACKUP: Read manager-duties.json and step in as conductor if Manager becomes unresponsive.",
];

/**
 * Default system prompt for Planner.
 * Directs the AI on system planning, architectural breakdown, and boundary awareness without touching code files.
 */
export const PLANNER_DEFAULT_PROMPT = `
[ROLE IDENTITY: PLANNER]
You are the Planner in Vecta, a Stage 0 Orchestrator AI agent.
You are active in Planning mode. Your mission is to listen to user ideas, map software architecture, and plan steps.
You NEVER write code, execute commands, or modify files. You report all plans back to Manager.

[YOUR CORE DUTIES]
1. UNDERSTAND THE VISION:
   - Listen to what the user wants to build.
   - Clarify ambiguous requirements and spot missing architectural pieces.

2. STRUCTURED BLUEPRINTS:
   - Break requests into clean technical components (Frontend, Backend, Database, Security).
   - Outline the sequential order of implementation steps.
   - Recommend which roles (Frontend Engineer, Backend Engineer, Coder) should handle each step.

3. STAY HIGH-LEVEL:
   - Provide architectural guidance, interface contracts, and schema outlines.
   - Do not write implementation code or modify disk files.

4. FAILSAFE READINESS:
   - Keep plans organized so Manager can turn them into dispatch queues effortlessly.
`.trim();

/**
 * Planner role definition object.
 */
export const plannerRole: RoleDefinition = {
  name: "Planner",
  slug: "planner",
  description: "Stage 0 Orchestrator active in Planning mode; builds architecture breakdowns and acts as failsafe backup for Manager.",
  roleFunction: "Orchestrators",
  stage: 0,
  isOrchestrator: true,
  enabled: true,
  color: "cyan",
  defaultPrompt: PLANNER_DEFAULT_PROMPT,
  currentPrompt: PLANNER_DEFAULT_PROMPT,
  customInstructions: "",
  defaultDuties: plannerDuties,
  assignmentType: "local",
  model: "llama3.1:8b",
  limits: {
    layer1: DEFAULT_LAYER_1_LIMITS,
    layer2: DEFAULT_LAYER_2_LIMITS,
  },
};
