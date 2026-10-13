// Status:: in-progress
// Central registry and export hub for all 9 built-in Vecta roles.
// Gives other parts of the app a single clean place to look up roles and their rules.

import { type RoleDefinition } from "./base.js";
import { managerRole } from "./manager.js";
import { plannerRole } from "./planner.js";
import { coderRole } from "./coder.js";
import { frontendEngineerRole } from "./frontend-engineer.js";
import { backendEngineerRole } from "./backend-engineer.js";
import { codeReviewerRole } from "./code-reviewer.js";
import { securityCheckerRole } from "./security-checker.js";
import { reviewerRole } from "./reviewer.js";
import { documenterRole } from "./documenter.js";

export * from "./base.js";
export * from "./manager.js";
export * from "./planner.js";
export * from "./coder.js";
export * from "./frontend-engineer.js";
export * from "./backend-engineer.js";
export * from "./code-reviewer.js";
export * from "./security-checker.js";
export * from "./reviewer.js";
export * from "./documenter.js";

export {
  managerRole,
  plannerRole,
  coderRole,
  frontendEngineerRole,
  backendEngineerRole,
  codeReviewerRole,
  securityCheckerRole,
  reviewerRole,
  documenterRole,
};

/**
 * All 9 built-in roles ordered sequentially by execution categories:
 * Orchestrators (Manager, Planner) -> Builders (Coder, Frontend, Backend) -> Checkers (Code Reviewer, Security Checker, Reviewer) -> Finalizers (Documenter).
 */
export const ALL_BUILTIN_ROLES: RoleDefinition[] = [
  managerRole,
  plannerRole,
  coderRole,
  frontendEngineerRole,
  backendEngineerRole,
  codeReviewerRole,
  securityCheckerRole,
  reviewerRole,
  documenterRole,
];

/**
 * Fast lookup map for built-in roles by slug.
 */
export const BUILTIN_ROLES_BY_SLUG: Record<string, RoleDefinition> = {
  manager: managerRole,
  planner: plannerRole,
  coder: coderRole,
  "frontend-engineer": frontendEngineerRole,
  "backend-engineer": backendEngineerRole,
  "code-reviewer": codeReviewerRole,
  "security-checker": securityCheckerRole,
  reviewer: reviewerRole,
  documenter: documenterRole,
};
