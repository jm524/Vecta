// Status:: done
// Memory state — multi-tier memory engine for Vecta.
// Strictly implements Sprint Plan §2E (exactly three files: general.json, CCM.json, summary.json)
// and word limits: 350-word cap for summary.json, 700-word cap for CCM.json (Sprint Plan §5, Claude Docs 12 & 13).
// Only Documenter writes passively; user can view and edit directly from /memory (Claude Docs 05, 06, 12, 13).

import fs from "node:fs";
import path from "node:path";
import { getVectaDir } from "../interface/src/helpers/paths.js";
import { ChatService } from "../interface/src/services/chat-service.js";

/** Counts words in a string cleanly */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Truncates text to the specified word limit.
 * Used to enforce the 350-word cap (summary.json) and 700-word cap (CCM.json).
 */
export function truncateWords(text: string, maxWords: number): string {
  if (!text || !text.trim()) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
}

/**
 * Truncates text by pruning oldest words from the beginning of the string,
 * preserving the most recent maxWords.
 * Used for rolling 350-word summary.json compaction per Claude Doc 14.
 */
export function truncateOldestWords(text: string, maxWords: number): string {
  if (!text || !text.trim()) return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(words.length - maxWords).join(" ");
}

/** Tier 1: Global Preferences schema (.vecta/memory/general.json) */
export interface GlobalPreferencesData {
  preferences: string[];
  updatedAt: string;
}

/** Tier 2: Scoped Cross-Chat Memory schema */
export interface ScopeCCM {
  scopeId: string; // "general" or project id
  scopeName: string; // "General (standalone chats)" or project name
  keyPoints: string[]; // Permanent, never auto-compacted
  narrative: string; // Rolling story, capped at 700 words
  updatedAt: string;
}

/** Tier 3: Per-Chat Summary schema (.vecta/chats/[chat-id]/summary.json) */
export interface ChatSummary {
  chatId: string;
  keyPoints: string[]; // Per-chat permanent Key Points
  narrative: string; // Rolling per-chat summary, capped at 350 words
  updatedAt: string;
}

/** Scope summary for the /memory scope list overview */
export interface MemoryScopeOverview {
  id: string; // "general" or project id
  name: string; // "General (standalone chats)" or project name
  type: "general" | "project";
  keyPointsCount: number;
  narrativeWordCount: number;
  updatedAt: string;
}

/** Chat memory overview for /memory Chats tab */
export interface ChatMemoryOverview {
  chatId: string;
  title: string;
  projectId?: string | null;
  projectName?: string;
  keyPointsCount: number;
  narrativeWordCount: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// PATH HELPERS
// ---------------------------------------------------------------------------

export function getGeneralMemoryPath(customDir?: string): string {
  const base = customDir || getVectaDir();
  return path.join(base, "memory", "general.json");
}

export function getGeneralCCMPath(customDir?: string): string {
  const base = customDir || getVectaDir();
  return path.join(base, "memory", "CCM.json");
}

export function getProjectCCMPath(projectId: string, customDir?: string): string {
  const base = customDir || getVectaDir();
  return path.join(base, "projects", projectId, "CCM.json");
}

export function getChatSummaryPath(chatId: string, customDir?: string): string {
  const base = customDir || getVectaDir();
  return path.join(base, "chats", chatId, "summary.json");
}

// ---------------------------------------------------------------------------
// TIER 1: GLOBAL PREFERENCES (.vecta/memory/general.json)
// ---------------------------------------------------------------------------

export function getGlobalPreferences(customDir?: string): string[] {
  const filePath = getGeneralMemoryPath(customDir);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as GlobalPreferencesData;
    return Array.isArray(data.preferences) ? data.preferences : [];
  } catch {
    return [];
  }
}

export function saveGlobalPreferences(preferences: string[], customDir?: string): string[] {
  const filePath = getGeneralMemoryPath(customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const payload: GlobalPreferencesData = {
    preferences,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return preferences;
}

export function addGlobalPreference(pref: string, customDir?: string): string[] {
  const trimmed = pref.trim();
  if (!trimmed) return getGlobalPreferences(customDir);
  const current = getGlobalPreferences(customDir);
  current.push(trimmed);
  return saveGlobalPreferences(current, customDir);
}

export function updateGlobalPreference(index: number, newText: string, customDir?: string): string[] {
  const trimmed = newText.trim();
  const current = getGlobalPreferences(customDir);
  if (index >= 0 && index < current.length) {
    if (trimmed) {
      current[index] = trimmed;
    } else {
      current.splice(index, 1);
    }
    return saveGlobalPreferences(current, customDir);
  }
  return current;
}

export function removeGlobalPreference(index: number, customDir?: string): string[] {
  const current = getGlobalPreferences(customDir);
  if (index >= 0 && index < current.length) {
    current.splice(index, 1);
    return saveGlobalPreferences(current, customDir);
  }
  return current;
}

// ---------------------------------------------------------------------------
// TIER 2: SCOPED CROSS-CHAT MEMORY (CCM.json)
// ---------------------------------------------------------------------------

/**
 * Loads a scope's CCM.json (General scope or Project scope).
 */
export function getScopeCCM(scopeId: string, customDir?: string): ScopeCCM {
  const isGeneral = scopeId === "general";
  const filePath = isGeneral ? getGeneralCCMPath(customDir) : getProjectCCMPath(scopeId, customDir);

  const defaultResult: ScopeCCM = {
    scopeId,
    scopeName: isGeneral ? "General (standalone chats)" : `Project ${scopeId}`,
    keyPoints: [],
    narrative: "",
    updatedAt: new Date().toISOString(),
  };

  if (!fs.existsSync(filePath)) {
    // If project scope, try reading project name from its meta.json
    if (!isGeneral) {
      const base = customDir || getVectaDir();
      const metaPath = path.join(base, "projects", scopeId, "meta.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          if (meta.name) defaultResult.scopeName = meta.name;
        } catch {
          // ignore
        }
      }
    }
    return defaultResult;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);

    // Support both wrapped structure { scopes: { general: ... } } and direct ScopeCCM
    if (parsed.scopes && parsed.scopes[scopeId]) {
      const entry = parsed.scopes[scopeId];
      return {
        scopeId,
        scopeName: entry.scopeName ?? defaultResult.scopeName,
        keyPoints: Array.isArray(entry.keyPoints) ? entry.keyPoints : [],
        narrative: typeof entry.narrative === "string" ? entry.narrative : "",
        updatedAt: entry.updatedAt ?? defaultResult.updatedAt,
      };
    }

    let scopeName = parsed.scopeName ?? defaultResult.scopeName;
    if (!isGeneral && (!parsed.scopeName || parsed.scopeName.startsWith("Project "))) {
      const base = customDir || getVectaDir();
      const metaPath = path.join(base, "projects", scopeId, "meta.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
          if (meta.name) scopeName = meta.name;
        } catch {
          // ignore
        }
      }
    }

    return {
      scopeId,
      scopeName,
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
      updatedAt: parsed.updatedAt ?? defaultResult.updatedAt,
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Saves a scope's CCM.json to disk.
 * Enforces 700-word limit on the cross-chat narrative (Sprint Plan §2E & §5).
 */
export function saveScopeCCM(scope: ScopeCCM, customDir?: string): ScopeCCM {
  const isGeneral = scope.scopeId === "general";
  const filePath = isGeneral ? getGeneralCCMPath(customDir) : getProjectCCMPath(scope.scopeId, customDir);

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Enforce rolling 700-word cap on cross-chat narrative
  const cleanNarrative = truncateOldestWords(scope.narrative, 700);

  const payload: ScopeCCM = {
    scopeId: scope.scopeId,
    scopeName: scope.scopeName,
    keyPoints: scope.keyPoints,
    narrative: cleanNarrative,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function addScopeKeyPoint(scopeId: string, point: string, customDir?: string): ScopeCCM {
  const trimmed = point.trim();
  const current = getScopeCCM(scopeId, customDir);
  if (!trimmed) return current;
  current.keyPoints.push(trimmed);
  return saveScopeCCM(current, customDir);
}

export function removeScopeKeyPoint(scopeId: string, index: number, customDir?: string): ScopeCCM {
  const current = getScopeCCM(scopeId, customDir);
  if (index >= 0 && index < current.keyPoints.length) {
    current.keyPoints.splice(index, 1);
    return saveScopeCCM(current, customDir);
  }
  return current;
}

export function updateScopeKeyPoint(
  scopeId: string,
  index: number,
  point: string,
  customDir?: string
): ScopeCCM {
  const current = getScopeCCM(scopeId, customDir);
  const trimmed = point.trim();
  if (index >= 0 && index < current.keyPoints.length && trimmed) {
    current.keyPoints[index] = trimmed;
    return saveScopeCCM(current, customDir);
  }
  return current;
}

export function updateScopeNarrative(scopeId: string, narrative: string, customDir?: string): ScopeCCM {
  const current = getScopeCCM(scopeId, customDir);
  current.narrative = narrative;
  return saveScopeCCM(current, customDir);
}

/**
 * Lists all active memory scopes in the system:
 * 1. General (standalone chats)
 * 2. Each existing Project workspace
 */
export function listMemoryScopes(customDir?: string): MemoryScopeOverview[] {
  const base = customDir || getVectaDir();
  const results: MemoryScopeOverview[] = [];

  // 1. General scope
  const generalCCM = getScopeCCM("general", base);
  results.push({
    id: "general",
    name: "General (standalone chats)",
    type: "general",
    keyPointsCount: generalCCM.keyPoints.length,
    narrativeWordCount: countWords(generalCCM.narrative),
    updatedAt: generalCCM.updatedAt,
  });

  // 2. Project scopes
  try {
    const chatService = new ChatService(base);
    const projects = chatService.listProjects();
    for (const proj of projects) {
      const projCCM = getScopeCCM(proj.id, base);
      results.push({
        id: proj.id,
        name: proj.name,
        type: "project",
        keyPointsCount: projCCM.keyPoints.length,
        narrativeWordCount: countWords(projCCM.narrative),
        updatedAt: projCCM.updatedAt,
      });
    }
  } catch {
    // If ChatService throws or index doesn't exist, proceed with General scope
  }

  return results;
}

// ---------------------------------------------------------------------------
// TIER 3: PER-CHAT SUMMARY (.vecta/chats/[chat-id]/summary.json)
// ---------------------------------------------------------------------------

export function getChatSummary(chatId: string, customDir?: string): ChatSummary {
  const filePath = getChatSummaryPath(chatId, customDir);
  const defaultSummary: ChatSummary = {
    chatId,
    keyPoints: [],
    narrative: "",
    updatedAt: new Date().toISOString(),
  };

  if (!fs.existsSync(filePath)) {
    return defaultSummary;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      chatId,
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
      updatedAt: parsed.updatedAt ?? defaultSummary.updatedAt,
    };
  } catch {
    return defaultSummary;
  }
}

export function saveChatSummary(summary: ChatSummary, customDir?: string): ChatSummary {
  const filePath = getChatSummaryPath(summary.chatId, customDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Enforce rolling 350-word cap: oldest words deleted from the beginning (Claude Doc 14)
  const cleanNarrative = truncateOldestWords(summary.narrative, 350);

  const payload: ChatSummary = {
    chatId: summary.chatId,
    keyPoints: summary.keyPoints,
    narrative: cleanNarrative,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

/**
 * Lists all chats with their summary stats for the /memory Chats tab.
 */
export function listChatMemories(customDir?: string): ChatMemoryOverview[] {
  const base = customDir || getVectaDir();
  try {
    const chatService = new ChatService(base);
    const chats = chatService.listChats();
    const projects = chatService.listProjects();
    const projectMap = new Map<string, string>();
    for (const p of projects) {
      projectMap.set(p.id, p.name);
    }
    return chats.map((c) => {
      const summary = getChatSummary(c.id, base);
      return {
        chatId: c.id,
        title: c.title,
        projectId: c.projectId,
        projectName: c.projectId ? projectMap.get(c.projectId) || "Project" : undefined,
        keyPointsCount: summary.keyPoints.length,
        narrativeWordCount: countWords(summary.narrative),
        updatedAt: c.updatedAt || summary.updatedAt,
      };
    });
  } catch {
    return [];
  }
}

export function addChatKeyPoint(chatId: string, point: string, customDir?: string): ChatSummary {
  const current = getChatSummary(chatId, customDir);
  const trimmed = point.trim();
  if (trimmed && !current.keyPoints.includes(trimmed)) {
    current.keyPoints.push(trimmed);
    return saveChatSummary(current, customDir);
  }
  return current;
}

export function removeChatKeyPoint(chatId: string, index: number, customDir?: string): ChatSummary {
  const current = getChatSummary(chatId, customDir);
  if (index >= 0 && index < current.keyPoints.length) {
    current.keyPoints.splice(index, 1);
    return saveChatSummary(current, customDir);
  }
  return current;
}

export function updateChatKeyPoint(
  chatId: string,
  index: number,
  point: string,
  customDir?: string
): ChatSummary {
  const current = getChatSummary(chatId, customDir);
  const trimmed = point.trim();
  if (index >= 0 && index < current.keyPoints.length && trimmed) {
    current.keyPoints[index] = trimmed;
    return saveChatSummary(current, customDir);
  }
  return current;
}

export function updateChatNarrative(
  chatId: string,
  narrative: string,
  customDir?: string
): ChatSummary {
  const current = getChatSummary(chatId, customDir);
  current.narrative = narrative;
  return saveChatSummary(current, customDir);
}

// ---------------------------------------------------------------------------
// DAY 18 (OCT 21): MULTI-TIER MEMORY ASSEMBLY FOR AGENT BRIEFS
// ---------------------------------------------------------------------------

export interface AssembledMemoryTiers {
  tier1Preferences: string[];
  tier2CCM: ScopeCCM;
  tier3Summary: ChatSummary;
}

/**
 * Loads all 3 memory tiers for a given chat and optional project scope.
 * Tier 1: Global preferences (.vecta/memory/general.json)
 * Tier 2: Scoped Cross-Chat Memory (CCM.json)
 * Tier 3: Active Chat Summary (summary.json)
 */
export function loadAllMemoryTiers(
  chatId: string,
  projectId?: string | null,
  customDir?: string
): AssembledMemoryTiers {
  const tier1Preferences = getGlobalPreferences(customDir);
  const scopeId = projectId && projectId.trim() ? projectId.trim() : "general";
  const tier2CCM = getScopeCCM(scopeId, customDir);
  const tier3Summary = getChatSummary(chatId, customDir);

  return {
    tier1Preferences,
    tier2CCM,
    tier3Summary,
  };
}

/**
 * Formats the assembled memory tiers into clear prompt sections for agent task briefs.
 */
export function formatMemoryTiersForBrief(tiers: AssembledMemoryTiers): string {
  const blocks: string[] = [];

  // Tier 1: Global Preferences
  if (tiers.tier1Preferences && tiers.tier1Preferences.length > 0) {
    blocks.push(
      `[TIER 1 - GLOBAL PREFERENCES]\n` +
        tiers.tier1Preferences.map((p, i) => `${i + 1}. ${p}`).join("\n")
    );
  }

  // Tier 2: Scoped Cross-Chat Memory (CCM)
  const ccmPoints = tiers.tier2CCM?.keyPoints?.filter(Boolean) || [];
  const ccmNarrative = (tiers.tier2CCM?.narrative || "").trim();
  if (ccmPoints.length > 0 || ccmNarrative) {
    const ccmParts: string[] = [];
    if (tiers.tier2CCM?.scopeName) {
      ccmParts.push(`Scope: ${tiers.tier2CCM.scopeName}`);
    }
    if (ccmPoints.length > 0) {
      ccmParts.push(`Key Points:\n${ccmPoints.map((kp) => `- ${kp}`).join("\n")}`);
    }
    if (ccmNarrative) {
      ccmParts.push(`Cross-Chat Context:\n${ccmNarrative}`);
    }
    blocks.push(`[TIER 2 - CROSS-CHAT MEMORY (CCM)]\n` + ccmParts.join("\n\n"));
  }

  // Tier 3: Active Chat Summary
  const chatPoints = tiers.tier3Summary?.keyPoints?.filter(Boolean) || [];
  const chatNarrative = (tiers.tier3Summary?.narrative || "").trim();
  if (chatPoints.length > 0 || chatNarrative) {
    const chatParts: string[] = [];
    if (chatPoints.length > 0) {
      chatParts.push(`Key Points:\n${chatPoints.map((kp) => `- ${kp}`).join("\n")}`);
    }
    if (chatNarrative) {
      chatParts.push(`Chat Summary:\n${chatNarrative}`);
    }
    blocks.push(`[TIER 3 - ACTIVE CHAT MEMORY]\n` + chatParts.join("\n\n"));
  }

  return blocks.join("\n\n");
}
