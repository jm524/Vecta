import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolves the .vecta storage directory.
// In development, uses `source/.vecta` so you can inspect and test files locally.
// In production, uses standard OS app data directories.
export function getVectaDir(): string {
  // If explicitly specified by environment variable, respect it
  if (process.env["VECTA_HOME"]) {
    return path.resolve(process.env["VECTA_HOME"]);
  }

  // During local development, target the repository's local `source/.vecta` folder
  const isDev = process.env["NODE_ENV"] !== "production";
  if (isDev) {
    // Navigate from interface/src/helpers up to source/.vecta
    const localDevDir = path.resolve(__dirname, "..", "..", "..", ".vecta");
    return localDevDir;
  }

  // Production OS-specific paths
  const homeDir = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env["LOCALAPPDATA"] || path.join(homeDir, "AppData", "Local"), "vecta");
    case "darwin":
      return path.join(homeDir, "Library", "Application Support", "vecta");
    default:
      // Linux / Unix fallback
      return path.join(process.env["XDG_DATA_HOME"] || path.join(homeDir, ".local", "share"), "vecta");
  }
}

// Ensures all essential .vecta runtime directories and default files exist
export function initVectaStorage(baseDir: string = getVectaDir()): void {
  const dirs = [
    baseDir,
    path.join(baseDir, "chats"),
    path.join(baseDir, "projects"),
    path.join(baseDir, "memory"),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Default config.json
  const configPath = path.join(baseDir, "config.json");
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      username: os.userInfo().username || "Developer",
      theme: "default",
      autonomy: "off", // Sprint Plan §2D: two modes only ("off" | "full")
      timeouts: {
        roleTimeoutSeconds: 600, // 10 min (Sprint Plan §5)
        warningThresholdSeconds: 300, // 5 min
      },
      rawLogCapMB: 256, // Sprint Plan §5
      tokenCaps: {
        cap1: 10000,
        cap2: 100000,
      },
      roles: {
        manager: { enabled: true, model: "llama3.1:8b" },
        planner: { enabled: true, model: "llama3.1:8b" },
        coder: { enabled: true, model: "llama3.1:8b" },
        "frontend-engineer": { enabled: true, model: "llama3.1:8b" },
        "backend-engineer": { enabled: true, model: "llama3.1:8b" },
        "code-reviewer": { enabled: true, model: "llama3.1:8b" },
        "security-checker": { enabled: true, model: "llama3.1:8b" },
        reviewer: { enabled: true, model: "llama3.1:8b" },
        documenter: { enabled: true, model: "llama3.1:8b" },
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
  }

  // Sprint Plan §2E: exactly three memory files across the system
  // 1. general.json — global preferences across all scopes
  const generalMemoryPath = path.join(baseDir, "memory", "general.json");
  if (!fs.existsSync(generalMemoryPath)) {
    const defaultGeneral = {
      preferences: [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(generalMemoryPath, JSON.stringify(defaultGeneral, null, 2), "utf8");
  }

  // 2. CCM.json — cross-chat memory per scope
  const ccmPath = path.join(baseDir, "memory", "CCM.json");
  if (!fs.existsSync(ccmPath)) {
    const defaultCCM = {
      scopes: {
        general: {
          keyPoints: [],
          narrative: "", // 700-word cap
        },
      },
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(ccmPath, JSON.stringify(defaultCCM, null, 2), "utf8");
  }
}
