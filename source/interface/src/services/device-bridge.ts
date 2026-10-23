// Status:: complete
// Device Bridge Service (Sprint Plan §3 & Claude Doc 04).
// Manages the ADB reverse tunnel (adb reverse tcp:8765 tcp:8765) and coordinates
// synchronization between the desktop CLI and companion devices (e.g. Android client).
import { spawn } from "node:child_process";
import { engineBridge } from "../bridge/client.js";
import type { DeviceServerStatusResult, DeviceServerUpdateResult } from "../types/bridge.js";

export interface DeviceBridgeState {
  serverRunning: boolean;
  port: number;
  boundAddress: string;
  adbReversed: boolean;
  lastSyncAt: string | null;
  connectedDevices?: ConnectedAdbDevice[];
}

export interface ConnectedAdbDevice {
  serial: string;
  state: "device" | "unauthorized" | "offline" | "recovery" | "unknown";
  model?: string;
  product?: string;
  isEmulator: boolean;
}

export class DeviceBridge {
  private static instance: DeviceBridge;
  private port: number = 8765;
  private isAdbReversed: boolean = false;
  private syncTimer: NodeJS.Timeout | null = null;

  public static getInstance(): DeviceBridge {
    if (!DeviceBridge.instance) {
      DeviceBridge.instance = new DeviceBridge();
    }
    return DeviceBridge.instance;
  }

  // Starts the Go companion device server and attempts to establish the ADB reverse tunnel.
  public async startServer(port: number = 8765): Promise<DeviceServerStatusResult> {
    this.port = port;
    const resp = await engineBridge.deviceServerStart(port);
    const data: DeviceServerStatusResult = resp.data || {
      running: resp.success,
      port,
      bound: `127.0.0.1:${port}`,
    };

    // Try setting up ADB reverse tunnel for Android emulator companion
    await this.setupAdbReverse(port);

    return data;
  }

  // Connects the device bridge: starts the server and sets up ADB reverse for all connected devices.
  public async connect(port: number = 8765): Promise<{ running: boolean; devices: ConnectedAdbDevice[]; adbReversed: boolean }> {
    this.port = port;
    const resp = await engineBridge.deviceServerStart(port);
    const [devices, adbReversed] = await Promise.all([
      this.listAdbDevices(),
      this.setupAdbReverse(port),
    ]);

    return {
      running: resp.success,
      devices,
      adbReversed,
    };
  }

  // Disconnects the device bridge: removes reverse tunnel and stops server.
  public async disconnect(port: number = 8765): Promise<boolean> {
    this.stopPeriodicSync();
    await this.removeAdbReverse(port);
    const resp = await engineBridge.deviceServerStop();
    this.isAdbReversed = false;
    return resp.success;
  }

  // Stops the companion device server.
  public async stopServer(): Promise<DeviceServerStatusResult> {
    this.stopPeriodicSync();
    const resp = await engineBridge.deviceServerStop();
    this.isAdbReversed = false;
    return resp.data || { running: false, port: this.port, bound: `127.0.0.1:${this.port}` };
  }

  // Gets the live status of the device companion server.
  public async getStatus(): Promise<DeviceBridgeState> {
    const [resp, devices] = await Promise.all([
      engineBridge.deviceServerStatus(),
      this.listAdbDevices(),
    ]);
    const data: DeviceServerStatusResult = resp.data || {
      running: false,
      port: this.port,
      bound: `127.0.0.1:${this.port}`,
    };

    return {
      serverRunning: data.running,
      port: data.port || this.port,
      boundAddress: data.bound || `127.0.0.1:${this.port}`,
      adbReversed: this.isAdbReversed,
      lastSyncAt: data.updatedAt || null,
      connectedDevices: devices,
    };
  }

  // Pushes the latest state (chat messages, queue tasks, roles, active generating status) to the device server
  // and returns any remote actions (toggles, prompt updates) sent by companion devices.
  public async syncState(payload: {
    chatId?: string;
    messages?: any[];
    tasks?: any[];
    roles?: any[];
    isProcessing?: boolean;
    activeRole?: string;
  }): Promise<DeviceServerUpdateResult> {
    const resp = await engineBridge.deviceServerUpdate(payload);
    return resp.data || { success: resp.success };
  }

  // Executes 'adb reverse tcp:port tcp:port' to forward the companion device's localhost port to the host.
  public async setupAdbReverse(port: number = 8765): Promise<boolean> {
    const devices = await this.listAdbDevices();
    if (devices.length === 0) {
      return new Promise<boolean>((resolve) => {
        try {
          const adb = spawn("adb", ["reverse", `tcp:${port}`, `tcp:${port}`], {
            stdio: "pipe",
          });
          adb.on("error", () => {
            this.isAdbReversed = false;
            resolve(false);
          });
          adb.on("close", (code) => {
            this.isAdbReversed = code === 0;
            resolve(code === 0);
          });
          setTimeout(() => resolve(this.isAdbReversed), 2500);
        } catch {
          this.isAdbReversed = false;
          resolve(false);
        }
      });
    }

    let anySuccess = false;
    for (const dev of devices) {
      const ok = await new Promise<boolean>((resolve) => {
        try {
          const adb = spawn("adb", ["-s", dev.serial, "reverse", `tcp:${port}`, `tcp:${port}`], {
            stdio: "pipe",
          });
          adb.on("error", () => resolve(false));
          adb.on("close", (code) => resolve(code === 0));
          setTimeout(() => resolve(false), 2500);
        } catch {
          resolve(false);
        }
      });
      if (ok) anySuccess = true;
    }

    this.isAdbReversed = anySuccess;
    return anySuccess;
  }

  // Lists all connected Android devices and emulators recognized by ADB.
  public async listAdbDevices(): Promise<ConnectedAdbDevice[]> {
    return new Promise<ConnectedAdbDevice[]>((resolve) => {
      try {
        const adb = spawn("adb", ["devices", "-l"], { stdio: "pipe" });
        let stdout = "";

        adb.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
        });

        adb.on("error", () => {
          resolve([]);
        });

        adb.on("close", () => {
          const lines = stdout.split(/\r?\n/).slice(1);
          const devices: ConnectedAdbDevice[] = [];
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
              const serial = parts[0]!;
              const state = parts[1] as ConnectedAdbDevice["state"];
              const modelMatch = trimmed.match(/model:(\S+)/);
              const productMatch = trimmed.match(/product:(\S+)/);
              devices.push({
                serial,
                state: state || "unknown",
                model: modelMatch ? modelMatch[1]?.replace(/_/g, " ") : undefined,
                product: productMatch ? productMatch[1] : undefined,
                isEmulator: serial.startsWith("emulator-"),
              });
            }
          }
          resolve(devices);
        });

        setTimeout(() => resolve([]), 2500);
      } catch {
        resolve([]);
      }
    });
  }

  // Removes ADB reverse port forwarding.
  public async removeAdbReverse(port: number = 8765): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        const adb = spawn("adb", ["reverse", "--remove", `tcp:${port}`], { stdio: "ignore" });
        adb.on("error", () => resolve(false));
        adb.on("close", (code) => {
          this.isAdbReversed = false;
          resolve(code === 0);
        });
        setTimeout(() => resolve(false), 2000);
      } catch {
        resolve(false);
      }
    });
  }

  // Starts a periodic background sync loop to push state to the companion device
  // and drain remote control actions.
  public startPeriodicSync(
    getState: () => { chatId?: string; messages?: any[]; tasks?: any[]; roles?: any[] },
    onRemoteActions?: (actions: { toggles?: any[]; prompts?: any[] }) => void,
    intervalMs: number = 2000
  ): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        const state = getState();
        const res = await this.syncState(state);
        if (onRemoteActions && res) {
          if ((res.toggles && res.toggles.length > 0) || (res.prompts && res.prompts.length > 0)) {
            onRemoteActions({ toggles: res.toggles, prompts: res.prompts });
          }
        }
      } catch {
        // Non-blocking sync failure
      }
    }, intervalMs);
  }

  // Stops the background periodic sync loop.
  public stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

export const deviceBridge = DeviceBridge.getInstance();
