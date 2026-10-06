import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { BridgeRequest, BridgeResponse } from "../types/bridge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This class manages the running Go engine subprocess.
// It sends JSON messages into Go's stdin and waits for answers on Go's stdout.
export class EngineBridge {
  private process: ChildProcessWithoutNullStreams | null = null;
  // A map to keep track of questions waiting for an answer, matched by message ID.
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: BridgeResponse<any>) => void;
      reject: (reason: Error) => void;
    }
  >();
  private requestCounter = 0;

  // Starts the Go engine program in the background.
  public start(): void {
    // Find where the Go engine binary lives.
    const enginePath = this.getEngineBinaryPath();

    if (!fs.existsSync(enginePath)) {
      throw new Error(`Go engine binary not found at: ${enginePath}. Run 'go build' in engine/ first.`);
    }

    // Launch the Go engine as a child process with standard input/output pipes.
    this.process = spawn(enginePath, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Listen to lines coming out of the Go engine.
    const lineReader = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    lineReader.on("line", (line: string) => {
      this.handleIncomingLine(line);
    });

    // Log any errors that Go prints to stderr so we can debug easily.
    this.process.stderr.on("data", (data: Buffer) => {
      console.error(`[Go Engine Error]: ${data.toString()}`);
    });

    // Clean up if the Go engine stops unexpectedly.
    this.process.on("close", (code: number | null) => {
      for (const [id, req] of this.pendingRequests.entries()) {
        req.reject(new Error(`Go engine exited with code ${code} while waiting for response to ${id}`));
      }
      this.pendingRequests.clear();
      this.process = null;
    });
  }

  // Sends a request object to Go and returns a Promise for the response.
  public send<T = unknown>(action: BridgeRequest["action"], payload?: any): Promise<BridgeResponse<T>> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        return reject(new Error("Go engine is not running or stdin is closed"));
      }

      // Generate a unique ID for this request.
      this.requestCounter += 1;
      const id = String(this.requestCounter);

      // Save the promise handlers so we can finish when Go sends the matching ID back.
      this.pendingRequests.set(id, { resolve, reject });

      const request: BridgeRequest = {
        id,
        action,
        payload,
      };

      // Write the request as a single JSON line followed by a newline character.
      this.process.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  // Helper function to ping the Go engine and check if it is awake.
  public async ping(): Promise<BridgeResponse<{ message: string; version: string }>> {
    return this.send<{ message: string; version: string }>("ping");
  }

  // Closes the Go engine process when the user exits the app.
  public stop(): void {
    if (this.process) {
      this.process.stdin.end();
      this.process.kill();
      this.process = null;
    }
  }

  // Finds the path to the Go binary whether on Windows (.exe) or Unix.
  private getEngineBinaryPath(): string {
    const isWindows = process.platform === "win32";
    const binaryName = isWindows ? "vecta-engine.exe" : "vecta-engine";

    // Navigates from interface/src/bridge to engine/
    const devPath = path.resolve(__dirname, "..", "..", "..", "engine", binaryName);
    return devPath;
  }

  // Parses one line of text from Go and matches it to its waiting request.
  private handleIncomingLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const response: BridgeResponse<any> = JSON.parse(trimmed);
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        this.pendingRequests.delete(response.id);
        pending.resolve(response);
      }
    } catch (err) {
      console.error(`[Bridge Error] Failed to parse JSON from Go: ${line}`, err);
    }
  }
}

// Single shared instance for the interface layer to use.
export const engineBridge = new EngineBridge();
