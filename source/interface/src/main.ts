import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { engineBridge } from "./bridge/client.js";
import { deviceBridge } from "./services/device-bridge.js";
import { initVectaStorage } from "./helpers/paths.js";
import {
  initKeyboardMonitor,
  stopKeyboardMonitor,
  isPhysicalShiftActive,
  isPhysicalCtrlActive,
} from "./helpers/keyboard.js";
import { shutdownOllamaServer, ensureOllamaRunning } from "./helpers/process.js";

// Standalone runner for device bridge (CLI command: vecta device [connect|start])
async function runDeviceServer(): Promise<void> {
  initVectaStorage();

  try {
    engineBridge.start();
  } catch (err: any) {
    console.error("Failed to start Go engine:", err.message);
    process.exit(1);
  }

  try {
    const port = 8765;
    await engineBridge.deviceServerStart(port);
    const [adbOk, devices] = await Promise.all([
      deviceBridge.setupAdbReverse(port),
      deviceBridge.listAdbDevices(),
    ]);

    console.log("==================================================");
    console.log("Vecta Device Bridge");
    console.log("==================================================");
    console.log(`Status:      Active on http://127.0.0.1:${port}`);
    console.log("Security:    Strict loopback only (strictly local USB, zero Wi-Fi)");

    if (devices.length > 0) {
      console.log(`Connected Devices (${devices.length}):`);
      for (const d of devices) {
        const typeLabel = d.isEmulator ? "Android Emulator" : "Connected Phone";
        const modelLabel = d.model || d.product || "Android Phone";
        console.log(`  * ${modelLabel} (${typeLabel}, serial: ${d.serial}, state: ${d.state})`);
      }
      console.log(`USB Reverse Tunnel: Active (tcp:${port} -> tcp:${port} established)`);
    } else {
      console.log("Connected Devices: None detected via USB.");
      console.log(`USB Reverse Tunnel: ${adbOk ? "Active (standby)" : "Standby (Waiting for USB connection)"}`);
      console.log("");
      console.log("To connect your phone:");
      console.log("  1. Plug in your Android phone via USB cable.");
      console.log("  2. In Android Settings -> Developer Options -> turn ON 'USB Debugging'.");
      console.log("  3. Tap 'Allow' when the prompt appears on your phone.");
    }

    console.log("");
    console.log("Endpoints:");
    console.log("  GET  /health");
    console.log("  GET  /status");
    console.log("  GET  /api/state");
    console.log("  POST /api/chat");
    console.log("  POST /api/queue");
    console.log("  POST /api/role/toggle");
    console.log("==================================================");
    console.log("Bridge running. Press Ctrl+C to disconnect.");

    let isStopping = false;
    const stopServer = async () => {
      if (isStopping) return;
      isStopping = true;
      console.log("\nDisconnecting device bridge...");
      try {
        await deviceBridge.removeAdbReverse(port);
        if (engineBridge.isRunning()) {
          await Promise.race([
            engineBridge.deviceServerStop(),
            new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 600)),
          ]);
        }
      } catch {
        // Ignore stream disconnect on process termination
      }
      engineBridge.stop();
      process.exit(0);
    };

    process.on("SIGINT", stopServer);
    process.on("SIGTERM", stopServer);

    // Keep process alive indefinitely
    await new Promise(() => {});
  } catch (err: any) {
    console.error("Device bridge failed:", err.message);
    engineBridge.stop();
    process.exit(1);
  }
}

// Check status of device bridge and connected phone via HTTP & ADB
async function checkDeviceStatus(): Promise<void> {
  try {
    const [res, devices] = await Promise.all([
      fetch("http://127.0.0.1:8765/status").catch(() => null),
      deviceBridge.listAdbDevices(),
    ]);

    console.log("==================================================");
    console.log("Vecta Device Bridge Status");
    console.log("==================================================");

    if (res && res.ok) {
      const data = (await res.json()) as any;
      console.log(`Server:      ACTIVE on http://127.0.0.1:${data.port || 8765} (Loopback only - zero Wi-Fi)`);
    } else {
      console.log("Server:      STOPPED (Run 'vecta device connect' to activate)");
    }

    if (devices.length > 0) {
      console.log(`Connected Devices (${devices.length}):`);
      for (const d of devices) {
        const typeLabel = d.isEmulator ? "Android Emulator" : "Connected Phone";
        const modelLabel = d.model || d.product || "Android Phone";
        console.log(`  * ${modelLabel} (${typeLabel}, serial: ${d.serial}, status: ${d.state})`);
      }
    } else {
      console.log("Connected Devices: None detected. (Plug in phone via USB with USB Debugging enabled)");
    }
    console.log("==================================================");
  } catch {
    console.log("Device bridge is not running. Run 'vecta device connect' to activate it.");
  }
  process.exit(0);
}

// Cleanly disconnect the device bridge
async function stopDeviceServer(): Promise<void> {
  initVectaStorage();
  try {
    engineBridge.start();
    await deviceBridge.removeAdbReverse(8765);
    await engineBridge.deviceServerStop();
    engineBridge.stop();
    console.log("Disconnected phone. USB bridge closed.");
  } catch {
    console.log("Device bridge is already disconnected.");
  }
  process.exit(0);
}

// main is the very first function that runs when you start Vecta.
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // CLI Flag: --version or -v
  if (args.includes("--version") || args.includes("-v")) {
    console.log("Vecta v0.1.0");
    process.exit(0);
  }

  // CLI Flag: --help or -h
  if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
    console.log(`
Vecta CLI - Autonomous Pair Programmer

Usage:
  vecta                     Launch interactive TUI terminal interface
  vecta device              List connected phone and USB tunnel status
  vecta device connect      Connect phone over USB tunnel (127.0.0.1:8765)
  vecta device disconnect   Disconnect phone and close USB tunnel
  vecta device status       Show status of connected phone and USB tunnel
  vecta --version, -v       Print Vecta version
  vecta --help, -h          Show this help message
`);
    process.exit(0);
  }

  // CLI Subcommand: vecta device [connect|disconnect|status]
  if (args[0] === "device") {
    const sub = args[1]?.toLowerCase();
    if (sub === "connect" || sub === "start" || sub === "run") {
      await runDeviceServer();
      return;
    }
    if (sub === "disconnect" || sub === "stop") {
      await stopDeviceServer();
      return;
    }
    // 'vecta device' or 'vecta device status' lists connected phone & status
    await checkDeviceStatus();
    return;
  }

  // If launching interactive TUI without a TTY, exit gracefully instead of throwing raw mode error
  if (!process.stdin.isTTY) {
    console.error("Vecta interactive terminal requires a TTY.\nRun 'vecta' inside a real terminal (PowerShell, Windows Terminal, or cmd.exe).\nUse 'vecta --help' for CLI options.");
    process.exit(1);
  }

  // Make sure the local .vecta data folders exist before doing anything else.
  initVectaStorage();

  // Ensure Ollama server is running in the background with external model drive (D:\)
  await ensureOllamaRunning().catch(() => {});

  // Start the Go engine background process and pre-warm it with ping and cryptoInit
  // BEFORE switching screen buffer or rendering Ink, so the CLI opens instantly ready to chat!
  try {
    engineBridge.start();
    await engineBridge.ping();
    await engineBridge.cryptoInit();
  } catch (err: any) {
    console.error("Failed to initialize Go engine:", err.message);
    process.exit(1);
  }

  // Initialize keyboard monitor for physical modifier detection
  initKeyboardMonitor();

/**
 * Filters raw stdin data before Node's readline parser breaks it apart:
 * 1. Converts SGR mouse wheel up/down (\x1b[<64; / \x1b[<65;) into pageup/pagedown keypresses for chat scrolling.
 * 2. Strips all mouse clicks, releases, and motion so clicking never pastes '[4' or garbage.
 * 3. Normalizes Shift+Enter from physical Shift key state, Kitty protocol (\x1b[13;2u),
 *    modifyOtherKeys (\x1b[27;2;13~), and Win32 input records into standard Shift+Enter keypress events.
 * 4. Ensures Ctrl+Enter is NEVER converted into a newline.
 */
function setupStdinFilter(): () => void {
  const originalEmit = process.stdin.emit;

  process.stdin.emit = function (event: string | symbol, ...args: any[]): boolean {
    if (event === "data") {
      const chunk = args[0];
      if (Buffer.isBuffer(chunk) || typeof chunk === "string") {
        const raw = chunk.toString("utf8");

        // 1. Mouse SGR Events (\x1b[<button;col;rowM or m)
        if (raw.includes("\x1b[<") || raw.startsWith("[<")) {
          const wheelUp = raw.includes("\x1b[<64;") || raw.includes("<64;");
          const wheelDown = raw.includes("\x1b[<65;") || raw.includes("<65;");

          if (wheelUp) {
            originalEmit.call(
              process.stdin,
              "keypress",
              "\x1b[5~",
              { name: "pageup", ctrl: false, meta: false, shift: false, sequence: "\x1b[5~" }
            );
          } else if (wheelDown) {
            originalEmit.call(
              process.stdin,
              "keypress",
              "\x1b[6~",
              { name: "pagedown", ctrl: false, meta: false, shift: false, sequence: "\x1b[6~" }
            );
          }

          // Strip all SGR mouse sequences (clicks, releases, motions, wheel)
          const cleaned = raw
            .replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, "")
            .replace(/\[<\d+;\d+;\d+[Mm]/g, "");

          if (!cleaned || /^\[<?\d*;?\d*;?\d*[Mm]?$/.test(cleaned) || cleaned === "[4") {
            return true;
          }
          args[0] = Buffer.isBuffer(chunk) ? Buffer.from(cleaned, "utf8") : cleaned;
        }

        // 2. Shift+Enter detection across physical Shift key, Kitty protocol, modifyOtherKeys, and Win32 input
        const isPhysicalShift = isPhysicalShiftActive() && !isPhysicalCtrlActive();
        const isKittyShiftEnter = raw.includes("\x1b[13;2u") || raw.includes("\x1b[10;2u");
        const isModifyShiftEnter = raw.includes("\x1b[27;2;13~");
        const isWin32ShiftEnter = /\x1b\[13;\d+;\d+;1;(?:16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32);\d+_/.test(raw);
        const isRawReturnWithShift = (raw === "\r" || raw === "\r\n") && isPhysicalShift;

        if (isKittyShiftEnter || isModifyShiftEnter || isWin32ShiftEnter || isRawReturnWithShift) {
          originalEmit.call(
            process.stdin,
            "keypress",
            "\n",
            { name: "return", ctrl: false, meta: false, shift: true, sequence: "\x1b[13;2u" }
          );
          if (isRawReturnWithShift) {
            return true;
          }
          const cleaned = raw
            .replace(/\x1b\[13;2u/g, "")
            .replace(/\x1b\[10;2u/g, "")
            .replace(/\x1b\[27;2;13~/g, "")
            .replace(/\x1b\[13;\d+;\d+;1;(?:16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32);\d+_/g, "");
          if (!cleaned) {
            return true;
          }
          args[0] = Buffer.isBuffer(chunk) ? Buffer.from(cleaned, "utf8") : cleaned;
        }

        // 3. Ctrl+Enter: ensure it is marked as ctrl and NEVER converted to newline
        if (raw.includes("\x1b[13;5u")) {
          originalEmit.call(
            process.stdin,
            "keypress",
            "\r",
            { name: "return", ctrl: true, meta: false, shift: false, sequence: "\x1b[13;5u" }
          );
          const cleaned = raw.replace(/\x1b\[13;5u/g, "");
          if (!cleaned) return true;
          args[0] = Buffer.isBuffer(chunk) ? Buffer.from(cleaned, "utf8") : cleaned;
        }
      }
    }
    return originalEmit.apply(process.stdin, [event, ...args]);
  };

  return () => {
    process.stdin.emit = originalEmit;
  };
}

// Switch terminal to Alternate Screen Buffer
// Enable enhanced keyboard reporting (modifyOtherKeys mode 2, Kitty protocol push flags \x1b[>1u)
// Disable alternate scroll mode (?1007l) so touchpad scroll does NOT send fake arrow keys
// Enable SGR mouse tracking (?1000h ?1006h) so mouse wheel is reported as scroll events, not arrow keys
process.stdout.write("\x1b[?1049h\x1b[>4;2m\x1b[>1u\x1b[?1007l\x1b[?1000h\x1b[?1006h\x1b[H");

const restoreStdin = setupStdinFilter();

// Make sure we stop the Go engine cleanly, shut down Ollama server, restore normal terminal, and stop keyboard monitor.
const cleanup = () => {
  restoreStdin();
  stopKeyboardMonitor();
  // Restore normal keyboard (pop Kitty flags \x1b[<1u), disable mouse tracking, restore main screen buffer
  process.stdout.write("\x1b[>4;0m\x1b[<1u\x1b[?1000l\x1b[?1006l\x1b[?1007h\x1b[?1049l");
  engineBridge.stop();
  shutdownOllamaServer();
};

  process.on("exit", cleanup);
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  // Render our React / Ink interface onto the terminal screen.
  const instance = render(React.createElement(App), {
    exitOnCtrlC: false,
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
