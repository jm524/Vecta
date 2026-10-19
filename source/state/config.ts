// Status:: done
// Config state — reads and writes .vecta/config.json.
// Central manager for user preferences, Layer 2 toggles, timeouts, token caps, log limits, and themes.
// Adheres strictly to Sprint Plan §2D, §2H, §2I, §5 and Claude Docs 05, 06, 14, 17.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getVectaDir } from "../interface/src/helpers/paths.js";

export interface VectaTimeouts {
  roleTimeoutSeconds: number; // default 600 (10 min per Sprint Plan §5)
  warningThresholdSeconds: number; // default 300 (5 min warning per Sprint Plan §5)
}

export interface VectaTokenCaps {
  cap1: number; // default 10,000 (Sprint Plan §5)
  cap2: number; // default 100,000 (Sprint Plan §5)
  enabled: boolean; // true = x notation (x1, x2), false = raw token numbers
}

export interface VectaLayer2Limits {
  confirmFileWrites: boolean; // default false (Doc 17 Layer 2)
  rolesTalkDirectly: boolean; // default false (Doc 17 Layer 2)
  showRoleThinking: boolean; // default true (Doc 17 Layer 2)
}

export interface VectaConfig {
  username: string;
  theme: string; // "default" | "cyan" | "royal" | "amber" | "emerald" | "monochrome"
  autonomy: "off" | "full"; // Sprint Plan §2D: two modes only
  timeouts: VectaTimeouts;
  rawLogCapMB: number; // default 256MB (max 1024MB per Sprint Plan §2H)
  autoDeleteWeeks: number; // default 2 weeks (Sprint Plan §2I)
  tokenCaps: VectaTokenCaps;
  layer2: VectaLayer2Limits;
  roles?: Record<string, any>;
  customRoles?: any[];
}

export const DEFAULT_CONFIG: VectaConfig = {
  username: os.userInfo().username || "Developer",
  theme: "default",
  autonomy: "off",
  timeouts: {
    roleTimeoutSeconds: 600,
    warningThresholdSeconds: 300,
  },
  rawLogCapMB: 256,
  autoDeleteWeeks: 2,
  tokenCaps: {
    cap1: 10000,
    cap2: 100000,
    enabled: true,
  },
  layer2: {
    confirmFileWrites: false,
    rolesTalkDirectly: false,
    showRoleThinking: true,
  },
};

/**
 * Returns the absolute path to .vecta/config.json
 */
export function getConfigPath(customDir?: string): string {
  const baseDir = customDir || getVectaDir();
  return path.join(baseDir, "config.json");
}

/**
 * Reads configuration from .vecta/config.json.
 * Self-heals with default values if fields are missing.
 */
export function readConfig(customDir?: string): VectaConfig {
  const filePath = getConfigPath(customDir);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      username: parsed.username ?? DEFAULT_CONFIG.username,
      theme: parsed.theme ?? DEFAULT_CONFIG.theme,
      autonomy: parsed.autonomy === "full" ? "full" : "off",
      timeouts: {
        roleTimeoutSeconds:
          parsed.timeouts?.roleTimeoutSeconds ?? DEFAULT_CONFIG.timeouts.roleTimeoutSeconds,
        warningThresholdSeconds:
          parsed.timeouts?.warningThresholdSeconds ?? DEFAULT_CONFIG.timeouts.warningThresholdSeconds,
      },
      rawLogCapMB: typeof parsed.rawLogCapMB === "number" ? parsed.rawLogCapMB : DEFAULT_CONFIG.rawLogCapMB,
      autoDeleteWeeks:
        typeof parsed.autoDeleteWeeks === "number" ? parsed.autoDeleteWeeks : DEFAULT_CONFIG.autoDeleteWeeks,
      tokenCaps: {
        cap1: parsed.tokenCaps?.cap1 ?? DEFAULT_CONFIG.tokenCaps.cap1,
        cap2: parsed.tokenCaps?.cap2 ?? DEFAULT_CONFIG.tokenCaps.cap2,
        enabled: parsed.tokenCaps?.enabled ?? DEFAULT_CONFIG.tokenCaps.enabled,
      },
      layer2: {
        confirmFileWrites:
          parsed.layer2?.confirmFileWrites ?? DEFAULT_CONFIG.layer2.confirmFileWrites,
        rolesTalkDirectly:
          parsed.layer2?.rolesTalkDirectly ?? DEFAULT_CONFIG.layer2.rolesTalkDirectly,
        showRoleThinking:
          parsed.layer2?.showRoleThinking ?? DEFAULT_CONFIG.layer2.showRoleThinking,
      },
      roles: parsed.roles ?? {},
      customRoles: parsed.customRoles ?? [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Writes or updates configuration in .vecta/config.json.
 * Preserves existing role preferences and merges updates cleanly.
 */
export function writeConfig(patch: Partial<VectaConfig>, customDir?: string): VectaConfig {
  const filePath = getConfigPath(customDir);
  const current = readConfig(customDir);

  const updated: VectaConfig = {
    ...current,
    ...patch,
    timeouts: {
      ...current.timeouts,
      ...(patch.timeouts || {}),
    },
    tokenCaps: {
      ...current.tokenCaps,
      ...(patch.tokenCaps || {}),
    },
    layer2: {
      ...current.layer2,
      ...(patch.layer2 || {}),
    },
    roles: patch.roles !== undefined ? patch.roles : current.roles,
    customRoles: patch.customRoles !== undefined ? patch.customRoles : current.customRoles,
  };

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf8");
  return updated;
}
