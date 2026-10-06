import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { engineBridge } from "./bridge/client.js";
import { initVectaStorage } from "./helpers/paths.js";

// main is the very first function that runs when you start Vecta.
async function main(): Promise<void> {
  // Make sure the local .vecta data folders exist before doing anything else.
  initVectaStorage();

  // Start the Go engine background process.
  try {
    engineBridge.start();
  } catch (err: any) {
    console.error("Failed to start Go engine:", err.message);
    process.exit(1);
  }

  // Make sure we stop the Go engine cleanly whenever the program closes.
  const cleanup = () => {
    engineBridge.stop();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // Render our React / Ink interface onto the terminal screen.
  const instance = render(React.createElement(App));

  // Wait until Ink says the app has finished running.
  await instance.waitUntilExit();
}

// Kick off the application and log any unhandled crash.
main().catch((err: any) => {
  console.error("Fatal startup error:", err);
  engineBridge.stop();
  process.exit(1);
});
