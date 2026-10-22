import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";
import * as fs from "node:fs";
import type {
  BridgeRequest,
  BridgeResponse,
  HardwareScanResult,
  CryptoInitResult,
  CryptoEncryptResult,
  CryptoDecryptResult,
  CryptoSecretResult,
} from "../types/bridge.js";

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
      this.pendingRequests.forEach((req, id) => {
        req.reject(new Error(`Go engine exited with code ${code} while waiting for response to ${id}`));
      });
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

      // Timeout watchdog: reject cleanly after 60s to prevent Promise deadlocks (BUG-002)
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Bridge request timed out after 60s (action: ${action}, id: ${id})`));
        }
      }, 60000);

      // Save the promise handlers so we can finish when Go sends the matching ID back.
      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

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

  // Helper function to trigger a full hardware, runtime, and model scan.
  public async hwScan(customPaths?: string[]): Promise<BridgeResponse<HardwareScanResult>> {
    return this.send<HardwareScanResult>("hw_scan", { customPaths });
  }

  // Initializes the primary encryption key in the OS native vault (Windows DPAPI / Keychain / Secret Service).
  public async cryptoInit(): Promise<BridgeResponse<CryptoInitResult>> {
    return this.send<CryptoInitResult>("crypto_init");
  }

  // Encrypts plaintext using AES-256-GCM via the Go crypto engine.
  // Returns 'ENC:v1:<base64>' ciphertext.
  public async cryptoEncrypt(plaintext: string): Promise<BridgeResponse<CryptoEncryptResult>> {
    return this.send<CryptoEncryptResult>("crypto_encrypt", { plaintext });
  }

  // Decrypts 'ENC:v1:<base64>' ciphertext using AES-256-GCM via the Go crypto engine.
  public async cryptoDecrypt(ciphertext: string): Promise<BridgeResponse<CryptoDecryptResult>> {
    return this.send<CryptoDecryptResult>("crypto_decrypt", { ciphertext });
  }

  // Stores an arbitrary named secret into the OS native vault (e.g. role API keys).
  public async cryptoStoreSecret(key: string, value: string): Promise<BridgeResponse<CryptoSecretResult>> {
    return this.send<CryptoSecretResult>("crypto_store_secret", { key, value });
  }

  // Retrieves an arbitrary named secret from the OS native vault.
  public async cryptoGetSecret(key: string): Promise<BridgeResponse<CryptoSecretResult>> {
    return this.send<CryptoSecretResult>("crypto_get_secret", { key });
  }

  // Checks if a named secret exists in the OS native vault.
  public async cryptoHasSecret(key: string): Promise<BridgeResponse<CryptoSecretResult>> {
    return this.send<CryptoSecretResult>("crypto_has_secret", { key });
  }

  // Deletes a named secret from the OS native vault.
  public async cryptoDeleteSecret(key: string): Promise<BridgeResponse<CryptoSecretResult>> {
    return this.send<CryptoSecretResult>("crypto_delete_secret", { key });
  }

  // Resets the queue runner's output hash loop detector history.
  public async queueReset(): Promise<BridgeResponse<{ success: boolean }>> {
    return this.send<{ success: boolean }>("queue_reset");
  }

  // Closes the Go engine process when the user exits the app.
  public stop(): void {
    if (this.process) {
      this.process.stdin.end();
      const pid = this.process.pid;
      if (process.platform === "win32" && pid) {
        try {
          spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
        } catch {
          this.process.kill();
        }
      } else {
        this.process.kill();
      }
      this.process = null;
    }
  }

  // Finds the path to the Go binary whether on Windows (.exe) or Unix.
  // Checks candidate paths to prevent bundled mode resolution failures (BUG-003).
  private getEngineBinaryPath(): string {
    const isWindows = process.platform === "win32";
    const binaryNames = isWindows
      ? ["vecta-engine.exe", "engine.exe"]
      : ["vecta-engine", "engine"];

    const scriptDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();
    const execDir = path.dirname(process.execPath);

    const searchDirs = [
      path.resolve(process.cwd(), "source", "engine"),
      path.resolve(process.cwd(), "engine"),
      path.resolve(process.cwd(), "..", "engine"),
      path.resolve(process.cwd(), "..", "..", "engine"),
      path.resolve(scriptDir, "..", "..", "..", "engine"),
      path.resolve(scriptDir, "..", "..", "engine"),
      path.resolve(scriptDir, "..", "engine"),
      path.resolve(scriptDir, "engine"),
      scriptDir,
      path.resolve(execDir, "engine"),
      execDir,
    ];

    for (const name of binaryNames) {
      for (const dir of searchDirs) {
        const fullPath = path.resolve(dir, name);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    return path.resolve(searchDirs[0]!, binaryNames[0]!);
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
