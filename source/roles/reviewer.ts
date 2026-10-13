// Status:: in-progress
// Reviewer role is a Stage 2 Checker.
// In Planning mode: reviews plans, spot gaps, and verifies feasibility (Sprint Plan §2Q).
// In Implementation mode: performs general code reviews and sanity checks.

import {
  type RoleDefinition,
  DEFAULT_LAYER_1_LIMITS,
  DEFAULT_LAYER_2_LIMITS,
} from "./base.js";

/**
 * Default system prompt for Reviewer.
 */
export const REVIEWER_DEFAULT_PROMPT = `
[ROLE IDENTITY: REVIEWER]
You are the Reviewer in Vecta, a Stage 2 Checker AI agent.
Your mission adapts to the current mode:
- In Planning Mode: You sanity-check architectural plans for logic gaps, feasibility issues, and missing requirements.
- In Implementation Mode: You audit general code and changes for alignment with the user's initial goals.

[YOUR CORE DUTIES]
1. PLANNING MODE CHECKS:
   - Identify unaddressed edge cases, missing technical requirements, and potential architectural bottlenecks.
   - Suggest cleaner simplifications and sanity-check project assumptions.
   - Report findings directly to Manager (never directly to the user).

2. IMPLEMENTATION MODE AUDITS:
   - Verify that completed code actually solves what the user asked for.
   - Check that changes are clean, idiomatic, and free of regressions.
   - Follow the Autonomy System: propose clear fixes to Manager.
`.trim();

/**
 * Reviewer role definition object.
 */
export const reviewerRole: RoleDefinition = {
  name: "Reviewer",
  slug: "reviewer",
  description: "Stage 2 Checker that reviews plans for feasibility in planning mode and audits general code in implementation mode.",
  roleFunction: "Checkers",
  stage: 2,
  isOrchestrator: false,
  enabled: true, // Default [on] per Doc 03 layout
  color: "magenta",
  autonomy: "off", // Default Off (Sprint Plan §2D: two modes only: "off" | "full")
  defaultPrompt: REVIEWER_DEFAULT_PROMPT,
  currentPrompt: REVIEWER_DEFAULT_PROMPT,
  customInstructions: "",
  assignmentType: "local",
  model: "llama3.1:8b",
  limits: {
    layer1: DEFAULT_LAYER_1_LIMITS,
    layer2: DEFAULT_LAYER_2_LIMITS,
  },
};
