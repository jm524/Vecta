// Status:: in-progress
// Keyboard helper that detects physical modifier key states on Windows via keymonitor.go
// and provides universal modifier & shortcut checks across all operating systems.
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

let physicalShiftActive = false;
let physicalCtrlActive = false;
let physicalAltActive = false;
let physicalMetaActive = false;
let monitorProcess: ChildProcess | null = null;

/**
 * Initializes the background key monitor process if running on Windows.
 * Tracks physical Shift, Ctrl, Alt, and Meta states in real-time.
 * On macOS and Linux, modifier states are reported directly by the terminal
 * via Kitty protocol and modifyOtherKeys mode 2.
 */
import { fileURLToPath } from "node:url";

export function initKeyboardMonitor(): void {
  if (process.platform !== "win32") return;
  if (monitorProcess) return;

  const currentModuleDir = (() => {
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return "";
    }
  })();

  const candidateDirs = [
    ...(currentModuleDir ? [
      currentModuleDir,
      path.resolve(currentModuleDir, "helpers"),
      path.resolve(currentModuleDir, "..", "helpers"),
      path.resolve(currentModuleDir, "..", "dist", "helpers"),
      path.resolve(currentModuleDir, "..", "src", "helpers"),
    ] : []),
    path.resolve(process.cwd(), "dist", "helpers"),
    path.resolve(process.cwd(), "dist"),
    path.resolve(process.cwd(), "source", "interface", "src", "helpers"),
    path.resolve(process.cwd(), "source", "interface", "dist", "helpers"),
    path.resolve(process.cwd(), "src", "helpers"),
    path.resolve(process.cwd(), "helpers"),
    path.resolve(process.argv[1] ? path.dirname(process.argv[1]) : process.cwd(), "helpers"),
    path.resolve(process.argv[1] ? path.dirname(process.argv[1]) : process.cwd()),
  ];

  let binaryPath = "";
  for (const dir of candidateDirs) {
    const candidate = path.join(dir, "keymonitor.exe");
    if (fs.existsSync(candidate)) {
      binaryPath = candidate;
      break;
    }
  }

  if (!binaryPath) return;

  try {
    monitorProcess = spawn(binaryPath, [], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });

    monitorProcess.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("K:")) {
          const parts = trimmed.split(":");
          physicalShiftActive = parts[1] === "1";
          physicalCtrlActive = parts[2] === "1";
          if (parts[3] !== undefined) physicalAltActive = parts[3] === "1";
          if (parts[4] !== undefined) physicalMetaActive = parts[4] === "1";
        }
      }
    });

    monitorProcess.on("error", () => {
      monitorProcess = null;
    });

    monitorProcess.on("exit", () => {
      monitorProcess = null;
    });

    process.on("exit", () => {
      stopKeyboardMonitor();
    });
  } catch {
    monitorProcess = null;
  }
}

/**
 * Stops the keyboard monitor process on exit.
 */
export function stopKeyboardMonitor(): void {
  if (monitorProcess) {
    try {
      monitorProcess.kill();
    } catch {
      // ignore
    }
    monitorProcess = null;
  }
}

export function isPhysicalShiftActive(): boolean {
  return physicalShiftActive;
}

export function isPhysicalCtrlActive(): boolean {
  return physicalCtrlActive;
}

export function isPhysicalAltActive(): boolean {
  return physicalAltActive;
}

export function isPhysicalMetaActive(): boolean {
  return physicalMetaActive;
}

/**
 * Universal Shift + Enter detector across all OS systems:
 * 1. Strictly ensures Ctrl+Enter does NOT work (returns false).
 * 2. On Windows: checks physical Shift key via keymonitor.go.
 * 3. On macOS/Linux: checks terminal escape sequences (Kitty, modifyOtherKeys) and Ink key flags.
 */
export function isShiftEnter(key?: any, input?: string): boolean {
  const seq = key?.sequence || input || "";

  // 1. Strictly disable Ctrl+Enter
  const isCtrl = Boolean(
    key?.ctrl ||
    physicalCtrlActive ||
    seq === "\x1b[13;5u" ||
    seq.includes("13;5")
  );
  if (isCtrl) {
    return false;
  }

  // 2. Check if Shift is active (physical state on Windows, or sequence / key on Unix)
  const isShift = Boolean(
    key?.shift ||
    physicalShiftActive ||
    seq === "\x1b[13;2u" ||
    seq === "\x1b[27;2;13~" ||
    seq.includes("13;2") ||
    seq.includes("27;2;13")
  );

  // 3. Check if Enter was clicked
  const isEnter = Boolean(
    key?.return ||
    input === "\r" ||
    input === "\n" ||
    seq === "\r" ||
    seq === "\n" ||
    seq === "\r\n" ||
    seq === "\x1b[13;2u" ||
    seq === "\x1b[27;2;13~" ||
    seq.includes("13;2") ||
    seq.includes("27;2;13")
  );

  return isShift && isEnter;
}
