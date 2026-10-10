import * as fs from "fs/promises";
import * as path from "path";
import { writeRelay, readRelay, clearRelay, type RoleBriefRelay, type RoleOutputRelay } from "../../state/relay.js";
import { engineBridge } from "./bridge/client.js";
import type { QueueDispatchResult } from "./types/bridge.js";
import { getVectaDir } from "./helpers/paths.js";

async function runE2ETest() {
  console.log("=== Running Vecta E2E Pipeline (Manager -> Coder -> Documenter) ===\n");

  const chatId = "test-chat-e2e";
  const rawLogPath = path.join(getVectaDir(), "chats", chatId, "raw.log");
  const relayPath = path.join(getVectaDir(), "chats", chatId, "task-relay.tmp");

  // Clean up any old state
  await fs.rm(path.dirname(rawLogPath), { recursive: true, force: true }).catch(() => {});

  console.log("[Step 1] Manager evaluates request and creates Task Brief...");
  
  const briefEntry: RoleBriefRelay = {
    case: "role_brief",
    target_role: "Coder",
    brief: "Create a simple math utility file.",
    files_allowed: ["source/test-math.ts"],
    user_request_summary: "I need a math utility",
    previous_role_summary: "None",
    memory_snippets: [],
    timestamp: new Date().toISOString(),
  };

  await writeRelay(chatId, briefEntry);
  console.log("✓ Manager wrote 'role_brief' to task-relay.tmp");

  console.log("\n[Step 2] Coder is dispatched and reads the brief...");
  const readBrief = await readRelay(chatId);
  if (readBrief?.case !== "role_brief") {
    throw new Error("Coder failed to read role_brief from relay");
  }
  console.log(`✓ Coder read task: "${readBrief.brief}"`);

  console.log("\n[Step 3] Coder executes via Go Engine (Queue Dispatch)...");
  engineBridge.start();
  
  const coderRes = await engineBridge.send<QueueDispatchResult>("queue_dispatch", {
    taskId: "task-coder-1",
    role: "Coder",
    stage: 1,
    prompt: readBrief.brief,
    filePaths: readBrief.files_allowed,
    fileBoundaries: ["source/"],
  });

  if (!coderRes.success) {
    throw new Error("Go engine dispatch failed: " + coderRes.error);
  }
  console.log(`✓ Coder execution complete. Output: "${coderRes.data?.output}"`);
  engineBridge.stop();

  console.log("\n[Step 4] Coder writes output to task-relay.tmp (triggering Documenter)...");
  const outputEntry: RoleOutputRelay = {
    case: "role_output",
    role: "Coder",
    task: readBrief.brief,
    output: "Created source/test-math.ts with basic arithmetic functions.",
    files_touched: ["source/test-math.ts"],
    timestamp: new Date().toISOString(),
  };

  // This will internally trigger Documenter.documenterPassiveCopy()
  await writeRelay(chatId, outputEntry);
  console.log("✓ Coder wrote 'role_output' and Documenter passively copied it");

  console.log("\n[Step 5] Manager reads output and clears relay...");
  const finalRead = await readRelay(chatId);
  if (finalRead?.case !== "role_output") {
    throw new Error("Manager failed to read role_output from relay");
  }
  
  await clearRelay(chatId);
  console.log("✓ Manager cleared task-relay.tmp");

  console.log("\n[Step 6] Validating Documenter raw.log content...");
  try {
    const rawLog = await fs.readFile(rawLogPath, "utf-8");
    console.log("--- raw.log contents ---");
    console.log(rawLog.trim());
    console.log("------------------------");
    
    if (!rawLog.includes("Coder finished task") || !rawLog.includes("test-math.ts")) {
      throw new Error("raw.log does not contain expected Documenter summary!");
    }
    console.log("✓ raw.log validation passed");
  } catch (error) {
    throw new Error(`Failed to read raw.log: ${error}`);
  }

  // Cleanup
  await fs.rm(path.dirname(rawLogPath), { recursive: true, force: true });
  console.log("\n✓ All E2E Pipeline steps PASSED successfully!");
}

runE2ETest().catch((err) => {
  console.error("Fatal E2E Error:", err);
  engineBridge.stop();
  process.exit(1);
});
