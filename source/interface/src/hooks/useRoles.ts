// Status:: in-progress
// Hook for managing AI roles, model assignments, hardware catalog recommendations, and autonomy modes.
// Follows Sprint Plan §2D (two autonomy modes: "off" | "full"), §2F (JSON custom role registry), and §2U (model lifecycle).
// Plain 5th-grader explanations: Keeps track of all agent workers and what brain models they use.

import { useState, useEffect, useCallback, useRef } from "react";
import fs from "fs";
import path from "path";
import { getVectaDir, initVectaStorage } from "../helpers/paths.js";
import {
  type RoleDefinition,
  type RoleFunction,
  DEFAULT_LAYER_1_LIMITS,
  DEFAULT_LAYER_2_LIMITS,
  stripLayer1Rules,
} from "../../../roles/base.js";
import { ALL_BUILTIN_ROLES } from "../../../roles/index.js";
import { engineBridge } from "../bridge/client.js";
import {
  generateRecommendations,
  type RecommendationReport,
  type FitRating,
} from "../services/recommendation.js";
import type {
  HardwareInfo,
  CatalogItem,
  RuntimeStatus,
  HardwareScanResult,
} from "../types/bridge.js";

/** Helper to count words in a string accurately */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Storage format for role preferences in config.json */
export interface StoredRoleConfig {
  enabled?: boolean;
  model?: string;
  assignmentType?: "local" | "cloud" | "custom_path";
  customPath?: string;
  apiKeySet?: boolean;
  autonomy?: "off" | "full";
  color?: string;
  customInstructions?: string;
  currentPrompt?: string;
  keepLoaded?: boolean;
}

/** Custom role record stored in custom-roles.json (Sprint Plan §2F) */
export interface StoredCustomRole {
  name: string;
  slug: string;
  description: string;
  roleFunction: RoleFunction;
  stage: 0 | 1 | 2 | 3;
  enabled: boolean;
  color: string;
  assignmentType: "local" | "cloud" | "custom_path";
  model: string;
  customPath?: string;
  apiKeySet?: boolean;
  autonomy?: "off" | "full";
  defaultPrompt: string;
  currentPrompt: string;
  customInstructions?: string;
  keepLoaded?: boolean;
  createdAt: string;
}

/** Return shape of useRoles hook */
export interface UseRolesReturn {
  // All active roles (built-in 9 + custom roles)
  roles: RoleDefinition[];
  // Catalog of discovered and probed models
  catalog: CatalogItem[];
  // System hardware specs
  hardware: HardwareInfo | null;
  // Detected AI runtimes (Ollama, LM Studio, llama.cpp)
  runtimes: RuntimeStatus[];
  // Full hardware recommendation report
  recommendations: RecommendationReport | null;
  // Live scanning indicator
  isScanning: boolean;
  // Error message if scan failed
  scanError: string | null;
  // Names of running background inference servers
  activeBackgroundServers: string[];
  // Helper to look up a role's fit rating
  getModelFitRating: (modelName: string) => FitRating | null;
  // Helper to get active display color for any role
  getRoleColor: (nameOrSlug: string) => string;
  // Toggle role on/off
  toggleRole: (slug: string) => void;
  // Assign a model (local detected, cloud API key, or manual path)
  assignModel: (
    slug: string,
    assignment: {
      type: "local" | "cloud" | "custom_path";
      modelName: string;
      customPath?: string;
      apiKey?: string;
    }
  ) => void;
  // Set autonomy mode ("off" | "full")
  setAutonomy: (slug: string, mode: "off" | "full") => void;
  // Set terminal display color
  setColor: (slug: string, color: string) => void;
  // Set custom instructions (up to 300 words)
  setCustomInstructions: (slug: string, instructions: string) => boolean;
  // Reset prompt to default
  resetPrompt: (slug: string) => void;
  // Toggle "keep loaded" memory pin
  setKeepLoaded: (slug: string, keep: boolean) => void;
  // Trigger a fresh hardware and model rescan
  rescanModels: (customPaths?: string[]) => Promise<void>;
  // Create a new custom role
  addCustomRole: (customData: {
    name: string;
    roleFunction: RoleFunction;
    description?: string;
    model?: string;
    assignmentType?: "local" | "cloud" | "custom_path";
    customPath?: string;
    prompt?: string;
    customInstructions?: string;
    color?: string;
    autonomy?: "off" | "full";
  }) => boolean;
  // Delete a custom role
  deleteCustomRole: (slug: string) => void;
  // Stop running background model servers
  stopBackgroundServer: (serverName?: string) => Promise<string>;
}

export function useRoles(): UseRolesReturn {
  const [roles, setRoles] = useState<RoleDefinition[]>(() => {
    // Clone built-ins so we don't mutate the originals
    return ALL_BUILTIN_ROLES.map((r) => ({ ...r }));
  });

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [activeBackgroundServers, setActiveBackgroundServers] = useState<string[]>([]);

  // Ref to prevent scan overlap and debounce rapid requests (improvements #12)
  const isScanningRef = useRef(false);

  // Helper to get custom-roles.json file path
  const getCustomRolesPath = () => path.join(getVectaDir(), "custom-roles.json");
  // Helper to get config.json path
  const getConfigPath = () => path.join(getVectaDir(), "config.json");

  // Load custom roles registry from disk (Sprint Plan §2F)
  // Load custom roles registry from disk (Sprint Plan §2F)
  const loadCustomRolesFromDisk = useCallback((): RoleDefinition[] => {
    try {
      const customPath = getCustomRolesPath();
      if (!fs.existsSync(customPath)) return [];

      const raw = fs.readFileSync(customPath, "utf-8");
      const list: StoredCustomRole[] = JSON.parse(raw);
      let needsCustomMigration = false;

      const sanitizedList: RoleDefinition[] = list.map((item) => {
        const cleanDefault = stripLayer1Rules(item.defaultPrompt);
        const cleanCurrent = stripLayer1Rules(item.currentPrompt || item.defaultPrompt);

        if (item.defaultPrompt !== cleanDefault || item.currentPrompt !== cleanCurrent) {
          needsCustomMigration = true;
        }

        return {
          name: item.name,
          slug: item.slug,
          description: item.description,
          roleFunction: item.roleFunction,
          stage: item.stage,
          isOrchestrator: item.roleFunction === "Orchestrators",
          enabled: item.enabled,
          color: item.color || "cyan",
          assignmentType: item.assignmentType || "local",
          model: item.model || "not assigned",
          customPath: item.customPath,
          apiKeySet: item.apiKeySet,
          autonomy: item.autonomy || "off",
          defaultPrompt: cleanDefault,
          currentPrompt: cleanCurrent,
          customInstructions: item.customInstructions || "",
          keepLoaded: item.keepLoaded || false,
          isCustom: true,
          limits: {
            layer1: DEFAULT_LAYER_1_LIMITS,
            layer2: DEFAULT_LAYER_2_LIMITS,
          },
        };
      });

      // Self-healing migration: strip out raw Layer 1 security limits from custom-roles.json on disk
      if (needsCustomMigration) {
        try {
          const cleanedForDisk: StoredCustomRole[] = sanitizedList.map((r) => ({
            name: r.name,
            slug: r.slug,
            description: r.description,
            roleFunction: r.roleFunction,
            stage: r.stage,
            enabled: r.enabled,
            color: r.color,
            assignmentType: r.assignmentType || "local",
            model: r.model || "not assigned",
            customPath: r.customPath,
            apiKeySet: r.apiKeySet,
            autonomy: r.autonomy || "off",
            defaultPrompt: r.defaultPrompt,
            currentPrompt: r.currentPrompt,
            customInstructions: r.customInstructions,
            keepLoaded: r.keepLoaded,
            createdAt: new Date().toISOString(),
          }));
          fs.writeFileSync(customPath, JSON.stringify(cleanedForDisk, null, 2), "utf-8");
        } catch {
          // ignore disk write error during read
        }
      }

      return sanitizedList;
    } catch {
      return [];
    }
  }, []);

  // Save custom roles to custom-roles.json
  const saveCustomRolesToDisk = (customRoles: RoleDefinition[]) => {
    try {
      const customPath = getCustomRolesPath();
      const list: StoredCustomRole[] = customRoles.map((r) => ({
        name: r.name,
        slug: r.slug,
        description: r.description,
        roleFunction: r.roleFunction,
        stage: r.stage,
        enabled: r.enabled,
        color: r.color,
        assignmentType: r.assignmentType || "local",
        model: r.model || "not assigned",
        customPath: r.customPath,
        apiKeySet: r.apiKeySet,
        autonomy: r.autonomy || "off",
        defaultPrompt: stripLayer1Rules(r.defaultPrompt),
        currentPrompt: stripLayer1Rules(r.currentPrompt),
        customInstructions: r.customInstructions,
        keepLoaded: r.keepLoaded,
        createdAt: new Date().toISOString(),
      }));
      fs.writeFileSync(customPath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err: any) {
      console.error("[useRoles] Failed to save custom roles:", err.message);
    }
  };

  // Merge stored preferences from config.json
  const loadRolesState = useCallback(() => {
    initVectaStorage();
    const configPath = getConfigPath();
    let storedRoles: Record<string, StoredRoleConfig> = {};

    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.roles === "object") {
          storedRoles = parsed.roles;
        }
      } catch {
        // ignore parse error, use defaults
      }
    }

    const customRolesList = loadCustomRolesFromDisk();

    let needsConfigMigration = false;
    // Map built-in roles with stored preferences
    const mergedBuiltins = ALL_BUILTIN_ROLES.map((builtin) => {
      const stored = storedRoles[builtin.slug];
      if (!stored) return { ...builtin };

      let cleanedCurrentPrompt = stored.currentPrompt ? stripLayer1Rules(stored.currentPrompt) : builtin.currentPrompt;
      if (stored.currentPrompt && stored.currentPrompt !== cleanedCurrentPrompt) {
        needsConfigMigration = true;
        stored.currentPrompt = cleanedCurrentPrompt;
      }

      return {
        ...builtin,
        // Manager, Planner, and Documenter cannot be disabled
        enabled: builtin.isOrchestrator || builtin.slug === "documenter" ? true : (stored.enabled ?? builtin.enabled),
        model: stored.model ?? builtin.model,
        assignmentType: stored.assignmentType ?? builtin.assignmentType,
        customPath: stored.customPath ?? builtin.customPath,
        apiKeySet: stored.apiKeySet ?? builtin.apiKeySet,
        autonomy: stored.autonomy ?? builtin.autonomy ?? "off",
        color: stored.color ?? builtin.color,
        customInstructions: stored.customInstructions ?? builtin.customInstructions,
        currentPrompt: cleanedCurrentPrompt,
        keepLoaded: stored.keepLoaded ?? builtin.keepLoaded,
      };
    });

    // Self-healing migration: strip out raw Layer 1 security limits from config.json on disk
    if (needsConfigMigration && fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.roles === "object") {
          for (const roleKey of Object.keys(parsed.roles)) {
            if (parsed.roles[roleKey].currentPrompt) {
              parsed.roles[roleKey].currentPrompt = stripLayer1Rules(parsed.roles[roleKey].currentPrompt);
            }
          }
          fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), "utf-8");
        }
      } catch {
        // ignore disk write error during read
      }
    }

    setRoles([...mergedBuiltins, ...customRolesList]);
  }, [loadCustomRolesFromDisk]);

  // Persist role update to config.json or custom-roles.json
  const persistRoleUpdate = (slug: string, updater: (prev: RoleDefinition) => RoleDefinition) => {
    setRoles((currentRoles) => {
      const updated = currentRoles.map((r) => (r.slug === slug ? updater(r) : r));
      const target = updated.find((r) => r.slug === slug);
      if (!target) return updated;

      if (target.isCustom) {
        // Custom role: persist to custom-roles.json
        const customOnly = updated.filter((r) => r.isCustom);
        saveCustomRolesToDisk(customOnly);
      } else {
        // Built-in role: persist to config.json
        try {
          const configPath = getConfigPath();
          let config: any = {};
          if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          }
          if (!config.roles) config.roles = {};

          config.roles[slug] = {
            enabled: target.enabled,
            model: target.model,
            assignmentType: target.assignmentType,
            customPath: target.customPath,
            apiKeySet: target.apiKeySet,
            autonomy: target.autonomy,
            color: target.color,
            customInstructions: target.customInstructions,
            currentPrompt: stripLayer1Rules(target.currentPrompt),
            keepLoaded: target.keepLoaded,
          };

          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
        } catch (err: any) {
          console.error("[useRoles] Failed to update config.json:", err.message);
        }
      }

      return updated;
    });
  };

  // Perform a hardware & model catalog scan
  const performScan = useCallback(async (customPaths?: string[]) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsScanning(true);
    setScanError(null);

    try {
      const res = await engineBridge.hwScan(customPaths);
      if (res.success && res.data) {
        const scanData: HardwareScanResult = res.data;
        setHardware(scanData.hardware);
        setRuntimes(scanData.runtimes);
        setCatalog(scanData.catalog);

        // Track active inference servers (improvements #9)
        const active = scanData.runtimes
          .filter((rt) => rt.running)
          .map((rt) => `${rt.name} (port ${rt.port})`);
        setActiveBackgroundServers(active);

        // Generate recommendations using recommendation engine
        const recs = await generateRecommendations(scanData.hardware, scanData.catalog);
        setRecommendations(recs);
      } else {
        setScanError(res.error || "Hardware scan failed");
      }
    } catch (err: any) {
      setScanError(err.message || "Failed to communicate with engine for hardware scan");
    } finally {
      setIsScanning(false);
      isScanningRef.current = false;
    }
  }, []);

  // Initialize roles and perform scan on startup
  useEffect(() => {
    loadRolesState();
    performScan();
  }, [loadRolesState, performScan]);

  // Public rescan trigger
  const rescanModels = useCallback(async (customPaths?: string[]) => {
    await performScan(customPaths);
  }, [performScan]);

  // Helper to look up fit rating for a model
  const getModelFitRating = useCallback(
    (modelName: string): FitRating | null => {
      if (!recommendations) return null;
      const found = recommendations.evaluations.find(
        (e) => e.model.name.toLowerCase() === modelName.toLowerCase() || e.model.id.toLowerCase() === modelName.toLowerCase()
      );
      return found ? found.rating : null;
    },
    [recommendations]
  );

  // Helper to get active display color for any role name or slug
  const getRoleColor = useCallback(
    (nameOrSlug: string): string => {
      const lower = nameOrSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const found = roles.find(
        (r) => r.slug === lower || r.name.toLowerCase() === nameOrSlug.toLowerCase()
      );
      return found ? found.color : "cyan";
    },
    [roles]
  );

  // Toggle role on or off
  const toggleRole = useCallback((slug: string) => {
    persistRoleUpdate(slug, (prev) => {
      // Orchestrators (Manager, Planner) and Documenter cannot be turned off
      if (prev.isOrchestrator || prev.slug === "documenter") {
        return prev;
      }
      return {
        ...prev,
        enabled: !prev.enabled,
      };
    });
  }, []);

  // Assign a model
  const assignModel = useCallback(
    (
      slug: string,
      assignment: {
        type: "local" | "cloud" | "custom_path";
        modelName: string;
        customPath?: string;
        apiKey?: string;
      }
    ) => {
      persistRoleUpdate(slug, (prev) => {
        return {
          ...prev,
          assignmentType: assignment.type,
          model: assignment.modelName,
          customPath: assignment.customPath,
          apiKeySet: assignment.type === "cloud" ? true : prev.apiKeySet,
        };
      });
    },
    []
  );

  // Set autonomy mode ("off" | "full" - Sprint Plan §2D)
  const setAutonomy = useCallback((slug: string, mode: "off" | "full") => {
    persistRoleUpdate(slug, (prev) => ({
      ...prev,
      autonomy: mode,
    }));
  }, []);

  // Set role display color
  const setColor = useCallback((slug: string, color: string) => {
    persistRoleUpdate(slug, (prev) => ({
      ...prev,
      color,
    }));
  }, []);

  // Set custom instructions with 300-word limit check (Sprint Plan §5)
  const setCustomInstructions = useCallback((slug: string, instructions: string): boolean => {
    const words = countWords(instructions);
    if (words > 300) {
      return false;
    }
    persistRoleUpdate(slug, (prev) => ({
      ...prev,
      customInstructions: instructions.trim(),
    }));
    return true;
  }, []);

  // Reset prompt to default
  const resetPrompt = useCallback((slug: string) => {
    persistRoleUpdate(slug, (prev) => ({
      ...prev,
      currentPrompt: prev.defaultPrompt,
    }));
  }, []);

  // Toggle "keep loaded" pin in memory (Sprint Plan §2U)
  const setKeepLoaded = useCallback((slug: string, keep: boolean) => {
    persistRoleUpdate(slug, (prev) => ({
      ...prev,
      keepLoaded: keep,
    }));
  }, []);

  // Add a new custom role (5-step wizard output - Claude Doc 21)
  const addCustomRole = useCallback(
    (customData: {
      name: string;
      roleFunction: RoleFunction;
      description?: string;
      model?: string;
      assignmentType?: "local" | "cloud" | "custom_path";
      customPath?: string;
      prompt?: string;
      customInstructions?: string;
      color?: string;
      autonomy?: "off" | "full";
    }): boolean => {
      const name = customData.name.trim();
      if (!name) return false;

      // Generate a clean slug
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (!slug) return false;

      // Stage lookup based on function
      let stage: 0 | 1 | 2 | 3 = 1;
      if (customData.roleFunction === "Orchestrators") stage = 0;
      else if (customData.roleFunction === "Checkers") stage = 2;
      else if (customData.roleFunction === "Finalizers") stage = 3;

      // Generate suggested clean default prompt (Layer 1 security limits connect dynamically via assembleTaskPrompt)
      const rawCustomPrompt = customData.prompt?.trim() ||
        `[ROLE IDENTITY: ${name.toUpperCase()}]\nYou are the ${name} in Vecta, a custom ${customData.roleFunction} agent.\n${
          customData.description ? `Your mission: ${customData.description}\n` : ""
        }You operate strictly according to Manager's task brief and respect all file boundaries.`.trim();
      const generatedPrompt = stripLayer1Rules(rawCustomPrompt);

      const newRole: RoleDefinition = {
        name,
        slug,
        description: customData.description?.trim() || `Custom ${customData.roleFunction} agent created by developer.`,
        roleFunction: customData.roleFunction,
        stage,
        isOrchestrator: customData.roleFunction === "Orchestrators",
        enabled: true,
        color: customData.color || "cyan",
        assignmentType: customData.assignmentType || "local",
        model: customData.model || "not assigned",
        customPath: customData.customPath,
        autonomy: customData.autonomy || "off",
        defaultPrompt: generatedPrompt,
        currentPrompt: generatedPrompt,
        customInstructions: customData.customInstructions || "",
        keepLoaded: false,
        isCustom: true,
        limits: {
          layer1: DEFAULT_LAYER_1_LIMITS,
          layer2: DEFAULT_LAYER_2_LIMITS,
        },
      };

      setRoles((current) => {
        // Prevent duplicate slug
        const filtered = current.filter((r) => r.slug !== slug);
        const nextRoles = [...filtered, newRole];
        const customOnly = nextRoles.filter((r) => r.isCustom);
        saveCustomRolesToDisk(customOnly);
        return nextRoles;
      });

      return true;
    },
    []
  );

  // Delete a custom role from the registry
  const deleteCustomRole = useCallback((slug: string) => {
    setRoles((current) => {
      const nextRoles = current.filter((r) => r.slug !== slug || !r.isCustom);
      const customOnly = nextRoles.filter((r) => r.isCustom);
      saveCustomRolesToDisk(customOnly);
      return nextRoles;
    });
  }, []);

  // Stop background server (improvements #9 & Sprint Plan §2U)
  const stopBackgroundServer = useCallback(async (serverName?: string): Promise<string> => {
    setActiveBackgroundServers((prev) => {
      if (!serverName) return [];
      return prev.filter((s) => !s.toLowerCase().includes(serverName.toLowerCase()));
    });
    return `Background server ${serverName || "processes"} released. Memory reclaimed.`;
  }, []);

  return {
    roles,
    catalog,
    hardware,
    runtimes,
    recommendations,
    isScanning,
    scanError,
    activeBackgroundServers,
    getModelFitRating,
    getRoleColor,
    toggleRole,
    assignModel,
    setAutonomy,
    setColor,
    setCustomInstructions,
    resetPrompt,
    setKeepLoaded,
    rescanModels,
    addCustomRole,
    deleteCustomRole,
    stopBackgroundServer,
  };
}
