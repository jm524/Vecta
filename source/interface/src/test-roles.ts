// Status:: in-progress
// Automated test script to verify Role definitions and prompt assembly.
// Runs via: bun run src/test-roles.ts or npx tsx src/test-roles.ts

import {
  managerRole,
  coderRole,
  assembleTaskPrompt,
  type TaskBrief,
  LAYER_1_SYSTEM_PROMPT_RULES,
} from "../../roles/index.js";

function runTests() {
  console.log("=== Running Vecta Role System Tests ===\n");

  // Test 1: Manager Role Structure
  console.log("[Test 1] Validating Manager Role Definition...");
  if (managerRole.name !== "Manager" || !managerRole.isOrchestrator) {
    throw new Error("Manager role definition invalid!");
  }
  if (!managerRole.defaultDuties || managerRole.defaultDuties.length !== 9) {
    throw new Error(`Expected 9 default duties in Manager, found ${managerRole.defaultDuties?.length}`);
  }
  if (!managerRole.defaultPrompt.includes("INSTRUCTIONS ONLY FROM BRIEF")) {
    throw new Error("Manager defaultPrompt missing Layer 1 rules!");
  }
  console.log("✓ Manager Role definition and 9 default duties verified.\n");

  // Test 2: Coder Role Structure
  console.log("[Test 2] Validating Coder Role Definition...");
  if (coderRole.name !== "Coder" || coderRole.stage !== 1 || coderRole.roleFunction !== "Builders") {
    throw new Error("Coder role definition invalid!");
  }
  if (!coderRole.defaultPrompt.includes("STRICT FILE SCOPE")) {
    throw new Error("Coder defaultPrompt missing Layer 1 rules!");
  }
  console.log("✓ Coder Role definition and Builder stage verified.\n");

  // Test 3: Prompt Assembly (4-layer stack)
  console.log("[Test 3] Testing 4-layer Prompt Assembly...");
  const sampleBrief: TaskBrief = {
    userRequest: "Create a login button in Login.tsx",
    taskDescription: "Build the Login component with TypeScript strict types",
    allowedPaths: ["source/interface/src/components/Login.tsx"],
    allowedBoundaries: ["source/interface/"],
    memorySnippets: ["User prefers Tailwind-style utility colors", "Dark theme is active"],
    plan: "1. Create Login.tsx -> 2. Review types -> 3. Document",
  };

  const assembledPrompt = assembleTaskPrompt(coderRole, sampleBrief);

  if (!assembledPrompt.includes("[ROLE IDENTITY: CODER]")) {
    throw new Error("Assembled prompt missing base identity!");
  }
  if (!assembledPrompt.includes("[VECTA LAYER 1 CORE SECURITY RULES")) {
    throw new Error("Assembled prompt missing Layer 1 rules!");
  }
  if (!assembledPrompt.includes("[RELEVANT PROJECT MEMORY]")) {
    throw new Error("Assembled prompt missing memory section!");
  }
  if (!assembledPrompt.includes("source/interface/src/components/Login.tsx")) {
    throw new Error("Assembled prompt missing allowed file paths!");
  }
  if (!assembledPrompt.includes("source/interface/")) {
    throw new Error("Assembled prompt missing allowed boundaries!");
  }
  console.log("✓ 4-layer Prompt Assembly verified:\n" + "-".repeat(40));
  console.log(assembledPrompt.slice(0, 300) + "\n... [truncated] ...\n" + assembledPrompt.slice(-250));
  console.log("-".repeat(40));

  console.log("\nAll Role System tests PASSED successfully!");
}

runTests();
