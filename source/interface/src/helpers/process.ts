// Status:: complete
// Process lifecycle management and background runtime shutdown helpers.
// Ensures external inference daemons (Ollama) on external drive D: run smoothly and release memory on exit.

import { execSync, spawn } from "child_process";
import fs from "fs";

/**
 * Ensures the Ollama background server is running, binding models from external drive D:.
 */
export async function ensureOllamaRunning(): Promise<boolean> {
  // 1. Fast probe to see if Ollama is already listening on 127.0.0.1:11434
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return true;
    }
  } catch {
    // Unreachable, needs startup
  }

  // 2. Determine external model directory on D:\
  let modelsDir = "";
  if (fs.existsSync("D:\\OllamaModels\\Vecta Model")) {
    modelsDir = "D:\\OllamaModels\\Vecta Model";
  } else if (fs.existsSync("D:\\OllamaModels")) {
    modelsDir = "D:\\OllamaModels";
  } else if (fs.existsSync("D:\\models")) {
    modelsDir = "D:\\models";
  }

  try {
    const env = { ...process.env };
    if (modelsDir) {
      env.OLLAMA_MODELS = modelsDir;
    }

    const child = spawn("ollama", ["serve"], {
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    // Give Ollama up to 2 seconds to initialize and open port 11434
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 200);
        const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          return true;
        }
      } catch {
        // Still initializing
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Shuts down the Ollama background server process across Windows, macOS, and Linux.
 * Reclaims all model VRAM and RAM when exiting Vecta.
 */
export function shutdownOllamaServer(): void {
  try {
    if (process.platform === "win32") {
      // Terminate ollama.exe and all spawned model runners immediately
      execSync("taskkill /F /IM ollama.exe /T", { stdio: "ignore", timeout: 2000 });
      execSync("taskkill /F /IM ollama_app.exe /T", { stdio: "ignore", timeout: 2000 });
    } else {
      // Terminate ollama serve daemon on macOS / Linux
      execSync("pkill -9 -f 'ollama serve' || pkill -9 ollama || true", { stdio: "ignore", timeout: 2000 });
    }
  } catch {
    // Non-blocking: Process may already be stopped or not running
  }
}
