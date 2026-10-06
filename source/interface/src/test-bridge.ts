// Status:: in-progress
// Simple test script to verify the TypeScript <-> Go bridge round-trip.
import { engineBridge } from "./bridge/client.js";

async function runTest(): Promise<void> {
  console.log("[Test] 1. Starting Go engine background process...");
  engineBridge.start();

  console.log("[Test] 2. Sending ping request over stdin...");
  const response = await engineBridge.ping();

  console.log("[Test] 3. Received response over stdout:");
  console.log(JSON.stringify(response, null, 2));

  if (response.success && response.data?.message === "pong from Go engine") {
    console.log("[Test] SUCCESS: JSON stdio round-trip verified!");
  } else {
    console.error("[Test] FAILED: Unexpected response", response);
    process.exit(1);
  }

  console.log("[Test] 4. Stopping Go engine cleanly...");
  engineBridge.stop();
  console.log("[Test] Done.");
}

runTest().catch((err: any) => {
  console.error("[Test Error]:", err);
  engineBridge.stop();
  process.exit(1);
});
