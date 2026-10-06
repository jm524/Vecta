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

  // Switch terminal to Alternate Screen Buffer (dedicated full-screen canvas like vim/opencode)
  process.stdout.write("\x1b[?1049h\x1b[H");

  // Make sure we stop the Go engine cleanly and restore the normal terminal screen.
  const cleanup = () => {
    // Switch back to Main Screen Buffer (wipes the UI from the terminal and restores history)
    process.stdout.write("\x1b[?1049l");
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
  const instance = render(React.createElement(App), {
    exitOnCtrlC: true,
  });

  // Wait until Ink says the app has finished running.
  await instance.waitUntilExit();
  instance.unmount();
  cleanup();
  process.exit(0);
}

// Kick off the application and log any unhandled crash.
main().catch((err: any) => {
  console.error("Fatal startup error:", err);
  engineBridge.stop();
  process.exit(1);
});
