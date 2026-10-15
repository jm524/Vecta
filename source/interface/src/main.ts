import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { engineBridge } from "./bridge/client.js";
import { initVectaStorage } from "./helpers/paths.js";
import {
  initKeyboardMonitor,
  stopKeyboardMonitor,
  isPhysicalShiftActive,
  isPhysicalCtrlActive,
} from "./helpers/keyboard.js";

// main is the very first function that runs when you start Vecta.
async function main(): Promise<void> {
  // Make sure the local .vecta data folders exist before doing anything else.
  initVectaStorage();

  // Initialize keyboard monitor for physical modifier detection
  initKeyboardMonitor();

  // Start the Go engine background process.
  try {
    engineBridge.start();
  } catch (err: any) {
    console.error("Failed to start Go engine:", err.message);
    process.exit(1);
  }

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

// Make sure we stop the Go engine cleanly, restore normal terminal, and stop keyboard monitor.
const cleanup = () => {
  restoreStdin();
  stopKeyboardMonitor();
  // Restore normal keyboard (pop Kitty flags \x1b[<1u), disable mouse tracking, restore main screen buffer
  process.stdout.write("\x1b[>4;0m\x1b[<1u\x1b[?1000l\x1b[?1006l\x1b[?1007h\x1b[?1049l");
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
