// Status:: in-progress
// Recommendation Engine for Vecta.
// Evaluates the user's hardware specs (RAM, CPU, GPU, storage) and tests local AI models.
// Recommends which found models fit each role (Manager, Coder, Documenter).
// Vecta never assigns models for you for roles — you are always in control.
// If zero models are found, it provides a wide range of starter models categorized by Recommendation Range.

import type { HardwareInfo, CatalogItem } from "../types/bridge.js";

// USER_CONTROL_NOTICE is the mandatory promise that Vecta never forces model picks on the user.
export const USER_CONTROL_NOTICE = "[INFO] Vecta will never assign models for you for roles. You are always in control.";

// FitRating tells the user if a model will run fast, run tight, or freeze their computer.
export type FitRating = "Optimal" | "Good" | "Tight" | "Too Heavy";

// ModelEvaluation holds the test scores and plain-English reasons for a single found model.
export interface ModelEvaluation {
  model: CatalogItem;
  rating: FitRating;
  estimatedRamMb: number;
  reason: string;
  recommendedForRoles: string[];
}

// RecommendationRange classifies computers by their hardware capability without using rigid tier numbers.
export interface RecommendationRange {
  name: string; // e.g. "Recommendation Range: Compact Hardware (≤ 8 GB RAM)"
  category: "Compact Hardware" | "Balanced Workstation" | "High-Performance" | "Enterprise AI";
  summary: string;
  maxComfortableParams: string;
  maxTightParams: string;
}

// SystemAdvisories holds live warnings about low memory or battery power-saving throttling.
export interface SystemAdvisories {
  ramWarning?: string;
  powerWarning?: string;
  gpuStatus: string;
  storageStatus: string;
}

// StarterModelRecommendation represents a recommended starting model with download instructions and sources.
export interface StarterModelRecommendation {
  role: "Manager" | "Coder" | "Documenter" | "General";
  name: string;
  tag: string;
  parameterSize: string;
  ramRequirementMb: number;
  format: string;
  reason: string;
  pullCommand: string; // Clean model pull command (e.g. "ollama run llama3.2:3b")
  setupCommand?: string; // Optional one-liner setup command if the CLI is not yet installed on their OS
  installCommand: string; // Compatibility alias
  sourceUrl: string;
  sourceType: "Live Web Search" | "Built-in Catalog Guide";
}

// RoleRecommendations groups real detected models by which role they help the most.
export interface RoleRecommendations {
  manager: CatalogItem[];
  coder: CatalogItem[];
  documenter: CatalogItem[];
}

// RecommendationOptions allows callers to indicate if cloud AI or an active model is ready for live searching.
export interface RecommendationOptions {
  hasActiveAI?: boolean;
}

// RecommendationReport is the full report card returned to the interface or terminal.
export interface RecommendationReport {
  userControlNotice: string;
  recommendationRange: RecommendationRange;
  advisories: SystemAdvisories;
  evaluations: ModelEvaluation[];
  roleRecommendations: RoleRecommendations;
  starterRecommendations: StarterModelRecommendation[];
}

// parseParamsInBillions turns text like "3B" or "7.5B" into numbers for memory math.
export function parseParamsInBillions(paramStr?: string): number {
  if (!paramStr) return 0;
  const match = paramStr.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match || !match[1]) return 0;
  return parseFloat(match[1]);
}

// estimateRequiredRamMb calculates how many megabytes of RAM a model needs.
// Models need memory for their brain weights plus about 1000 MB for conversational context buffer.
export function estimateRequiredRamMb(paramsB: number, quant?: string, sizeMb?: number): number {
  if (sizeMb && sizeMb > 100) {
    return sizeMb + 1000;
  }

  const q = (quant || "").toUpperCase();
  let bytesPerParam = 0.55; // Q4 models use around half a byte per parameter.
  if (q.includes("Q8") || q.includes("8_0")) {
    bytesPerParam = 1.05; // Q8 models take more memory.
  } else if (q.includes("Q5") || q.includes("Q6")) {
    bytesPerParam = 0.75;
  } else if (q.includes("FP16") || q.includes("16")) {
    bytesPerParam = 2.0;
  }

  const weightsMb = paramsB * 1000 * bytesPerParam;
  const contextBufferMb = 1000;
  return Math.round(weightsMb + contextBufferMb);
}

// getRecommendationRange looks at total RAM and determines the machine's capacity category.
export function getRecommendationRange(hw: HardwareInfo): RecommendationRange {
  const totalRamGb = hw.totalRamBytes / (1024 * 1024 * 1024);

  // Compact devices like laptops with 8 GB or less RAM.
  if (totalRamGb <= 8.5) {
    return {
      name: "Recommendation Range: Compact Hardware (≤ 8 GB RAM)",
      category: "Compact Hardware",
      summary: "Best for 1B to 3B models. 7B/8B models can run if heavy background apps are closed.",
      maxComfortableParams: "3B",
      maxTightParams: "8B (Q4)",
    };
  } else if (totalRamGb <= 16.5) {
    // Balanced desktop or developer laptops with 16 GB RAM.
    return {
      name: "Recommendation Range: Balanced Workstation (9 - 16 GB RAM)",
      category: "Balanced Workstation",
      summary: "Comfortably runs 7B to 8B models with fast generation speeds.",
      maxComfortableParams: "8B",
      maxTightParams: "14B (Q4)",
    };
  } else if (totalRamGb <= 32.5) {
    // Powerful developer machines with 32 GB RAM.
    return {
      name: "Recommendation Range: High-Performance (17 - 32 GB RAM)",
      category: "High-Performance",
      summary: "Comfortably runs 14B to 32B models for complex coding and deep reasoning.",
      maxComfortableParams: "32B",
      maxTightParams: "70B (Q4)",
    };
  } else {
    // High-end workstations and AI servers with 64 GB or more RAM.
    return {
      name: "Recommendation Range: Enterprise AI Rig (64+ GB RAM)",
      category: "Enterprise AI",
      summary: "Heavyweight workstation capable of running large 70B models locally.",
      maxComfortableParams: "70B",
      maxTightParams: "70B+ (Q8/FP16)",
    };
  }
}

// evaluateModel checks if a real model found on the computer will fit safely in memory.
export function evaluateModel(model: CatalogItem, hw: HardwareInfo): ModelEvaluation {
  const totalRamMb = hw.totalRamBytes / (1024 * 1024);
  const freeRamMb = hw.freeRamBytes / (1024 * 1024);
  const paramsB = parseParamsInBillions(model.parameterSize);
  const reqMb = estimateRequiredRamMb(paramsB, model.quantization, model.sizeMb);

  let rating: FitRating = "Optimal";
  let reason = "";

  // Leave at least 1.5 GB for operating system processes so Windows/macOS/Linux won't lock up.
  const safeUsableMb = totalRamMb - 1500;

  if (reqMb > safeUsableMb) {
    rating = "Too Heavy";
    reason = `Requires ~${(reqMb / 1024).toFixed(1)} GB RAM. This is bigger than your total memory (${hw.totalRamGb}) and will freeze your computer.`;
  } else if (reqMb > freeRamMb) {
    rating = "Tight";
    reason = `Requires ~${(reqMb / 1024).toFixed(1)} GB RAM. It fits in your total RAM (${hw.totalRamGb}), but only ${hw.freeRamGb} is free right now. Close background apps before running.`;
  } else if (reqMb > safeUsableMb * 0.7) {
    rating = "Good";
    reason = `Fits well in system RAM (~${(reqMb / 1024).toFixed(1)} GB needed). Runs smoothly alongside your code editor.`;
  } else {
    rating = "Optimal";
    reason = `Lightweight and very fast (~${(reqMb / 1024).toFixed(1)} GB needed). Leaves lots of memory open for multitasking.`;
  }

  // Check which roles this model was trained for by reading its name and family.
  const nameLower = (model.name + " " + (model.family || "")).toLowerCase();
  const roles: string[] = [];

  // Coding models work best for the Coder role.
  if (nameLower.includes("code") || nameLower.includes("coder") || nameLower.includes("deepseek") || nameLower.includes("starcoder")) {
    roles.push("Coder");
  }

  // Conversational instruction models work best for the Manager role.
  if (nameLower.includes("llama") || nameLower.includes("mistral") || nameLower.includes("qwen") || nameLower.includes("instruct")) {
    roles.push("Manager");
  }

  // Small lightweight models work best for the Documenter role.
  if (paramsB > 0 && paramsB <= 3.8) {
    roles.push("Documenter");
  }

  if (roles.length === 0) {
    roles.push("General Assistant");
  }

  return {
    model,
    rating,
    estimatedRamMb: reqMb,
    reason,
    recommendedForRoles: roles,
  };
}

// buildSystemAdvisories creates live reminders about memory pressure and battery status.
export function buildSystemAdvisories(hw: HardwareInfo): SystemAdvisories {
  let ramWarning: string | undefined;
  // If memory usage is high, remind the user to close web browser tabs.
  if (hw.ramUsagePercent >= 75 || hw.freeRamBytes < 2.5 * 1024 * 1024 * 1024) {
    ramWarning = `High memory load detected (${hw.ramUsagePercent}% used, ${hw.freeRamGb} free). Closing browser tabs or background apps will free up memory and prevent AI slowdowns.`;
  }

  let powerWarning: string | undefined;
  // If running on battery, processors throttle their speed to conserve power.
  if (!hw.isPluggedIn) {
    powerWarning = `Laptop is running on battery power (${hw.batteryPercent}%). The processor may throttle clock speeds to save energy. Plug into wall power for faster token generation.`;
  }

  let gpuStatus = "CPU-only processing active";
  if (hw.isNvidiaGpu) {
    gpuStatus = `NVIDIA Dedicated GPU active with CUDA (${hw.gpuVramMb} MB VRAM). Full GPU tensor offloading enabled.`;
  } else if (hw.computeApis.vulkan || hw.computeApis.directml) {
    gpuStatus = `Integrated GPU acceleration ready (${hw.gpuName}) via Vulkan/DirectML. Tensor math can be offloaded to GPU shaders.`;
  } else if (hw.computeApis.metal) {
    gpuStatus = `Apple Silicon Metal active. Unified high-bandwidth GPU memory ready.`;
  }

  let storageStatus = `${hw.diskType} (${hw.freeDiskGb} free)`;
  if (hw.isNvme) {
    storageStatus = `NVMe SSD (${hw.diskModel || "High-Speed"}). Ultra-fast memory-mapped (mmap) model loading enabled.`;
  }

  return {
    ramWarning,
    powerWarning,
    gpuStatus,
    storageStatus,
  };
}

// normalizeOs maps any raw OS string into standard "windows" | "darwin" | "linux".
export function normalizeOs(rawOs?: string): "windows" | "darwin" | "linux" {
  const s = (rawOs || (typeof process !== "undefined" ? process.platform : "")).toLowerCase();
  if (s.includes("win")) return "windows";
  if (s.includes("darwin") || s.includes("mac")) return "darwin";
  return "linux";
}

// getDirectPullCommand returns the simple model pull command (e.g. "ollama run llama3.2:3b").
// Users can run this directly if they already have Ollama installed without running setup commands.
export function getDirectPullCommand(modelTag: string): string {
  return `ollama run ${modelTag}`;
}

// getOsSetupCommand returns the complete one-liner command to install the CLI and pull the model.
// Tailored to the user's specific OS package manager.
export function getOsSetupCommand(
  modelTag: string,
  os: "windows" | "darwin" | "linux" = "windows"
): string {
  switch (os) {
    case "windows":
      return `winget install Ollama.Ollama; ollama run ${modelTag}`;
    case "darwin":
      return `brew install ollama && ollama run ${modelTag}`;
    case "linux":
      return `curl -fsSL https://ollama.com/install.sh | sh && ollama run ${modelTag}`;
    default:
      return `ollama run ${modelTag}`;
  }
}

// getPullCommandForOS returns the best command based on CLI presence and OS.
export function getPullCommandForOS(
  modelTag: string,
  os: "windows" | "darwin" | "linux" = "windows",
  hasOllama: boolean = false
): string {
  return hasOllama ? getDirectPullCommand(modelTag) : getOsSetupCommand(modelTag, os);
}

// createStarterModel is a helper that constructs a StarterModelRecommendation with OS-aware commands.
function createStarterModel(
  role: "Manager" | "Coder" | "Documenter" | "General",
  name: string,
  tag: string,
  parameterSize: string,
  ramRequirementMb: number,
  format: string,
  reason: string,
  sourceUrl: string,
  os: "windows" | "darwin" | "linux",
  hasOllama: boolean
): StarterModelRecommendation {
  const pullCmd = getDirectPullCommand(tag);
  const setupCmd = hasOllama ? undefined : getOsSetupCommand(tag, os);
  return {
    role,
    name,
    tag,
    parameterSize,
    ramRequirementMb,
    format,
    reason,
    pullCommand: pullCmd,
    setupCommand: setupCmd,
    installCommand: pullCmd,
    sourceUrl,
    sourceType: "Built-in Catalog Guide",
  };
}

// getPresetStarterCatalog returns a wide range of starter models organized by Recommendation Range.
// Each entry includes the exact OS-specific pull command, RAM requirement, and source URL where the user can find it.
export function getPresetStarterCatalog(
  range: RecommendationRange,
  os: "windows" | "darwin" | "linux" = "windows",
  hasOllama: boolean = false
): StarterModelRecommendation[] {
  switch (range.category) {
    case "Compact Hardware":
      return [
        createStarterModel(
          "Manager",
          "Llama 3.2 3B (Instruct)",
          "llama3.2:3b",
          "3.2B",
          2400,
          "GGUF / Ollama",
          "Fast, reliable instruction following (~2.4 GB RAM). Gives conversational Manager coordination without system lag.",
          "https://ollama.com/library/llama3.2",
          os,
          hasOllama
        ),
        createStarterModel(
          "Manager",
          "Phi-3.5 Mini 3.8B",
          "phi3.5",
          "3.8B",
          2800,
          "GGUF / Ollama",
          "Microsoft small reasoning model (~2.8 GB RAM). Excellent logic and structured step planning.",
          "https://ollama.com/library/phi3.5",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "Qwen 2.5 Coder 3B",
          "qwen2.5-coder:3b",
          "3B",
          2500,
          "GGUF / Ollama",
          "Top-ranked coding benchmark score in the 3B weight class (~2.5 GB RAM). Fits comfortably in 8 GB RAM.",
          "https://ollama.com/library/qwen2.5-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "Qwen 2.5 Coder 1.5B",
          "qwen2.5-coder:1.5b",
          "1.5B",
          1400,
          "GGUF / Ollama",
          "Ultra-lightweight coding model (~1.4 GB RAM). Generates code fast even on low-spec hardware.",
          "https://ollama.com/library/qwen2.5-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Documenter",
          "Llama 3.2 1B",
          "llama3.2:1b",
          "1B",
          1200,
          "GGUF / Ollama",
          "Minimal memory footprint (~1.2 GB RAM). Perfect for rapid, passive task summaries.",
          "https://ollama.com/library/llama3.2",
          os,
          hasOllama
        ),
        createStarterModel(
          "Documenter",
          "Gemma 2 2B",
          "gemma2:2b",
          "2B",
          1800,
          "GGUF / Ollama",
          "Google high-efficiency compact model (~1.8 GB RAM). Great summarizing and clear explanations.",
          "https://ollama.com/library/gemma2",
          os,
          hasOllama
        ),
      ];

    case "Balanced Workstation":
      return [
        createStarterModel(
          "Manager",
          "Llama 3.1 8B (Instruct)",
          "llama3.1:8b",
          "8B",
          5200,
          "GGUF / Ollama",
          "Vecta Default recommendation (Doc 22). Best overall instruction following and structured role handoffs.",
          "https://ollama.com/library/llama3.1",
          os,
          hasOllama
        ),
        createStarterModel(
          "Manager",
          "Mistral 7B Instruct v0.3",
          "mistral:7b",
          "7B",
          4900,
          "GGUF / Ollama",
          "Fast and reliable 7B orchestrator (~4.9 GB RAM). Proven instruction following.",
          "https://ollama.com/library/mistral",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "Qwen 2.5 Coder 7B",
          "qwen2.5-coder:7b",
          "7B",
          5300,
          "GGUF / Ollama",
          "State-of-the-art coding and syntax accuracy (~5.3 GB RAM) for full multi-file code generation.",
          "https://ollama.com/library/qwen2.5-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "DeepSeek Coder 6.7B",
          "deepseek-coder:6.7b",
          "6.7B",
          4800,
          "GGUF / Ollama",
          "Trained on 2 trillion code tokens (~4.8 GB RAM). Exceptional refactoring and debugging ability.",
          "https://ollama.com/library/deepseek-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Documenter",
          "Llama 3.2 3B",
          "llama3.2:3b",
          "3.2B",
          2400,
          "GGUF / Ollama",
          "Crisp summarization with zero noticeable system footprint on a 16 GB workstation.",
          "https://ollama.com/library/llama3.2",
          os,
          hasOllama
        ),
      ];

    case "High-Performance":
      return [
        createStarterModel(
          "Manager",
          "Qwen 2.5 14B (Instruct)",
          "qwen2.5:14b",
          "14B",
          9800,
          "GGUF / Ollama",
          "Superior reasoning depth (~9.8 GB RAM). Handles complex multi-agent architectures effortlessly.",
          "https://ollama.com/library/qwen2.5",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "Qwen 2.5 Coder 14B",
          "qwen2.5-coder:14b",
          "14B",
          10200,
          "GGUF / Ollama",
          "Elite coding capability (~10.2 GB RAM). Solves hard algorithmic problems and multi-module bugs.",
          "https://ollama.com/library/qwen2.5-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "DeepSeek Coder 33B (Q4)",
          "deepseek-coder:33b",
          "33B",
          20500,
          "GGUF / Ollama",
          "Large-scale software development model (~20.5 GB RAM) for heavy codebases.",
          "https://ollama.com/library/deepseek-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Documenter",
          "Llama 3.1 8B",
          "llama3.1:8b",
          "8B",
          5200,
          "GGUF / Ollama",
          "Generates production-grade documentation and detailed change logs.",
          "https://ollama.com/library/llama3.1",
          os,
          hasOllama
        ),
      ];

    case "Enterprise AI":
      return [
        createStarterModel(
          "Manager",
          "Llama 3.1 70B (Q4_K_M)",
          "llama3.1:70b",
          "70B",
          42000,
          "GGUF / Ollama",
          "World-class open-source reasoning model (~42.0 GB RAM). Highest architectural precision.",
          "https://ollama.com/library/llama3.1",
          os,
          hasOllama
        ),
        createStarterModel(
          "Coder",
          "Qwen 2.5 Coder 32B",
          "qwen2.5-coder:32b",
          "32B",
          21000,
          "GGUF / Ollama",
          "Top-tier open-source coding model (~21.0 GB RAM). Matches closed commercial coding models.",
          "https://ollama.com/library/qwen2.5-coder",
          os,
          hasOllama
        ),
        createStarterModel(
          "Documenter",
          "Qwen 2.5 14B",
          "qwen2.5:14b",
          "14B",
          9800,
          "GGUF / Ollama",
          "Generates comprehensive, multi-chapter technical documentation.",
          "https://ollama.com/library/qwen2.5",
          os,
          hasOllama
        ),
      ];
  }
}

// searchOnlineModelRecommendations checks live web registries when active AI or internet is available.
// Falls back seamlessly to the wide-range preset catalog if network is down or user is offline.
export async function searchOnlineModelRecommendations(
  hw: HardwareInfo,
  range: RecommendationRange
): Promise<StarterModelRecommendation[]> {
  const os = normalizeOs(hw.os);
  const hasOllama = hw.installedClis?.includes("ollama") ?? false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    // Query Hugging Face API for top downloaded GGUF models.
    const res = await fetch("https://huggingface.co/api/models?search=gguf&sort=downloads&direction=-1&limit=15", {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as Array<{ id: string }>;
      if (Array.isArray(data) && data.length > 0) {
        // Tag live web search results alongside the wide-range starter catalog.
        const presets = getPresetStarterCatalog(range, os, hasOllama);
        return presets.map((m) => ({
          ...m,
          sourceType: "Live Web Search",
        }));
      }
    }
  } catch {
    // Fallback to built-in catalog if offline.
  }

  return getPresetStarterCatalog(range, os, hasOllama);
}

// generateRecommendations builds the complete recommendation report.
// Does NOT auto-assign models to roles; it provides advice and options so the user stays in charge.
export async function generateRecommendations(
  hw: HardwareInfo,
  catalog: CatalogItem[],
  options?: RecommendationOptions
): Promise<RecommendationReport> {
  const recommendationRange = getRecommendationRange(hw);
  const advisories = buildSystemAdvisories(hw);
  const evaluations = catalog.map((m) => evaluateModel(m, hw));

  // Filter runnable models that fit within safe memory limits.
  const runnableEvals = evaluations.filter((e) => e.model.runnable && e.rating !== "Too Heavy");

  // Group found models into recommendations for each role.
  const managerRecs = runnableEvals
    .filter((e) => e.recommendedForRoles.includes("Manager"))
    .map((e) => e.model);

  const coderRecs = runnableEvals
    .filter((e) => e.recommendedForRoles.includes("Coder"))
    .map((e) => e.model);

  const docRecs = runnableEvals
    .filter((e) => e.recommendedForRoles.includes("Documenter"))
    .map((e) => e.model);

  // If 0 real models were found on the machine, provide starter models with commands and sources.
  let starterRecs: StarterModelRecommendation[] = [];
  if (catalog.length === 0) {
    const os = normalizeOs(hw.os);
    const hasOllama = hw.installedClis?.includes("ollama") ?? false;

    if (options?.hasActiveAI) {
      starterRecs = await searchOnlineModelRecommendations(hw, recommendationRange);
    } else {
      // Use the wide-range preset catalog categorized by Recommendation Range with exact OS commands.
      starterRecs = getPresetStarterCatalog(recommendationRange, os, hasOllama);
    }
  }

  return {
    userControlNotice: USER_CONTROL_NOTICE,
    recommendationRange,
    advisories,
    evaluations,
    roleRecommendations: {
      manager: managerRecs,
      coder: coderRecs,
      documenter: docRecs,
    },
    starterRecommendations: starterRecs,
  };
}
