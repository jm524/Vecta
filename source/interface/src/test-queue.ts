// Status:: in-progress
// Automated test script to verify FIFO sequential queue execution.
import { engineBridge } from "./bridge/client.js";
import type { QueueDispatchPayload, QueueDispatchResult } from "./types/bridge.js";

async function runQueueTest(): Promise<void> {
  console.log("[Queue Test] 1. Starting Go engine...");
  engineBridge.start();

  const pingRes = await engineBridge.ping();
  console.log("[Queue Test] 2. Ping response:", pingRes.data?.message);

  const testPipeline: QueueDispatchPayload[] = [
    {
      taskId: "task-01",
      role: "Backend Engineer",
      stage: 1,
      prompt: "Implement auth token endpoint",
      filePaths: ["source/engine/"],
      fileBoundaries: ["source/"],
    },
    {
      taskId: "task-02",
      role: "Security Checker",
      stage: 2,
      prompt: "Verify token signing key security",
      filePaths: ["source/engine/"],
      fileBoundaries: ["source/"],
    },
    {
      taskId: "task-03",
      role: "Documenter",
      stage: 3,
      prompt: "Record audit log entry",
      filePaths: ["source/.vecta/"],
      fileBoundaries: ["source/"],
    },
  ];

  console.log("[Queue Test] 3. Dispatching 3 tasks sequentially...");
  for (const task of testPipeline) {
    console.log(`[Queue Test] -> Dispatching ${task.taskId} to ${task.role}...`);
    const res = await engineBridge.send<QueueDispatchResult>("queue_dispatch", task);

    if (res.success && res.data) {
      console.log(`[Queue Test] ✓ ${task.role} finished: "${res.data.output}" (${res.data.tokensUsed} tokens)`);
    } else {
      console.error(`[Queue Test] ✗ ${task.role} failed:`, res.error);
      process.exit(1);
    }
  }

  console.log("[Queue Test] 4. Testing boundary violation security check...");
  const invalidTask: QueueDispatchPayload = {
    taskId: "task-bad",
    role: "Malicious Task",
    stage: 1,
    prompt: "Try to write outside boundaries",
    filePaths: ["C:\\Windows\\System32\\bad.dll"],
    fileBoundaries: ["source/"],
  };

  const badRes = await engineBridge.send<QueueDispatchResult>("queue_dispatch", invalidTask);
  if (!badRes.success && badRes.error?.includes("outside permitted boundaries")) {
    console.log("[Queue Test] ✓ Security check passed: Boundary violation was successfully blocked by Go!");
  } else {
    console.error("[Queue Test] ✗ Security boundary check failed to block invalid path!", badRes);
    process.exit(1);
  }

  console.log("[Queue Test] 5. Stopping Go engine cleanly...");
  engineBridge.stop();
  console.log("[Queue Test] SUCCESS: All queue execution tests passed!");
}

runQueueTest().catch((err: any) => {
  console.error("[Queue Test Fatal Error]:", err);
  engineBridge.stop();
  process.exit(1);
});
