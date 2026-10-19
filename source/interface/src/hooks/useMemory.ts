// Status:: done
// React Hook for multi-tier memory management in Vecta CLI.
// Provides live state and persistence methods for Tier 1 Global Preferences and Tier 2 Scoped CCM.
// Follows Sprint Plan §2E and Claude Docs 05, 06, 12, 13.

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  listMemoryScopes,
  listChatMemories,
  getScopeCCM,
  addScopeKeyPoint,
  removeScopeKeyPoint,
  updateScopeKeyPoint,
  updateScopeNarrative,
  getGlobalPreferences,
  addGlobalPreference,
  removeGlobalPreference,
  updateGlobalPreference,
  getChatSummary,
  addChatKeyPoint,
  removeChatKeyPoint,
  updateChatKeyPoint,
  updateChatNarrative,
  countWords,
  type MemoryScopeOverview,
  type ChatMemoryOverview,
  type ScopeCCM,
  type ChatSummary,
} from "../../../state/memory.js";

export interface UseMemoryReturn {
  // All discovered memory scopes (General + Projects)
  scopes: MemoryScopeOverview[];
  // All discovered chat memories
  chatMemories: ChatMemoryOverview[];
  // Global preferences across all scopes
  globalPreferences: string[];
  // Loading status
  loading: boolean;
  // Reload all memory data from disk
  refresh: () => void;
  // Get active CCM for a scope
  getCCM: (scopeId: string) => ScopeCCM;
  // Add a Key Point to a scope
  addKeyPoint: (scopeId: string, text: string) => ScopeCCM;
  // Remove a Key Point from a scope
  removeKeyPoint: (scopeId: string, index: number) => ScopeCCM;
  // Update an existing Key Point in a scope
  updateKeyPoint: (scopeId: string, index: number, text: string) => ScopeCCM;
  // Update narrative for a scope (enforces 700-word cap)
  setNarrative: (scopeId: string, narrative: string) => ScopeCCM;
  // Add a global preference
  addGlobalPref: (pref: string) => string[];
  // Remove a global preference
  removeGlobalPref: (index: number) => string[];
  // Update a global preference
  updateGlobalPref: (index: number, pref: string) => string[];
  // Per-chat summary methods
  getChat: (chatId: string) => ChatSummary;
  addChatPoint: (chatId: string, point: string) => ChatSummary;
  removeChatPoint: (chatId: string, index: number) => ChatSummary;
  updateChatPoint: (chatId: string, index: number, point: string) => ChatSummary;
  setChatNarrative: (chatId: string, narrative: string) => ChatSummary;
  // Word counter utility
  countWords: (text: string) => number;
}

export function useMemory(customDir?: string): UseMemoryReturn {
  const [scopes, setScopes] = useState<MemoryScopeOverview[]>([]);
  const [chatMemories, setChatMemories] = useState<ChatMemoryOverview[]>([]);
  const [globalPreferences, setGlobalPreferences] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Synchronously load memory state from disk
  const reload = useCallback(() => {
    try {
      const discovered = listMemoryScopes(customDir);
      const chats = listChatMemories(customDir);
      const prefs = getGlobalPreferences(customDir);
      setScopes(discovered);
      setChatMemories(chats);
      setGlobalPreferences(prefs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [customDir]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getCCM = useCallback(
    (scopeId: string): ScopeCCM => {
      return getScopeCCM(scopeId, customDir);
    },
    [customDir]
  );

  const handleAddKeyPoint = useCallback(
    (scopeId: string, text: string): ScopeCCM => {
      const res = addScopeKeyPoint(scopeId, text, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleRemoveKeyPoint = useCallback(
    (scopeId: string, index: number): ScopeCCM => {
      const res = removeScopeKeyPoint(scopeId, index, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleUpdateKeyPoint = useCallback(
    (scopeId: string, index: number, text: string): ScopeCCM => {
      const res = updateScopeKeyPoint(scopeId, index, text, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleSetNarrative = useCallback(
    (scopeId: string, narrative: string): ScopeCCM => {
      const res = updateScopeNarrative(scopeId, narrative, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleAddGlobalPref = useCallback(
    (pref: string): string[] => {
      const res = addGlobalPreference(pref, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleRemoveGlobalPref = useCallback(
    (index: number): string[] => {
      const res = removeGlobalPreference(index, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleUpdateGlobalPref = useCallback(
    (index: number, pref: string): string[] => {
      const res = updateGlobalPreference(index, pref, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const getChat = useCallback(
    (chatId: string): ChatSummary => {
      return getChatSummary(chatId, customDir);
    },
    [customDir]
  );

  const handleAddChatPoint = useCallback(
    (chatId: string, point: string): ChatSummary => {
      const res = addChatKeyPoint(chatId, point, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleRemoveChatPoint = useCallback(
    (chatId: string, index: number): ChatSummary => {
      const res = removeChatKeyPoint(chatId, index, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleUpdateChatPoint = useCallback(
    (chatId: string, index: number, point: string): ChatSummary => {
      const res = updateChatKeyPoint(chatId, index, point, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  const handleSetChatNarrative = useCallback(
    (chatId: string, narrative: string): ChatSummary => {
      const res = updateChatNarrative(chatId, narrative, customDir);
      reload();
      return res;
    },
    [customDir, reload]
  );

  return useMemo(
    () => ({
      scopes,
      chatMemories,
      globalPreferences,
      loading,
      refresh: reload,
      getCCM,
      addKeyPoint: handleAddKeyPoint,
      removeKeyPoint: handleRemoveKeyPoint,
      updateKeyPoint: handleUpdateKeyPoint,
      setNarrative: handleSetNarrative,
      addGlobalPref: handleAddGlobalPref,
      removeGlobalPref: handleRemoveGlobalPref,
      updateGlobalPref: handleUpdateGlobalPref,
      getChat,
      addChatPoint: handleAddChatPoint,
      removeChatPoint: handleRemoveChatPoint,
      updateChatPoint: handleUpdateChatPoint,
      setChatNarrative: handleSetChatNarrative,
      countWords,
    }),
    [
      scopes,
      chatMemories,
      globalPreferences,
      loading,
      reload,
      getCCM,
      handleAddKeyPoint,
      handleRemoveKeyPoint,
      handleUpdateKeyPoint,
      handleSetNarrative,
      handleAddGlobalPref,
      handleRemoveGlobalPref,
      handleUpdateGlobalPref,
      getChat,
      handleAddChatPoint,
      handleRemoveChatPoint,
      handleUpdateChatPoint,
      handleSetChatNarrative,
    ]
  );
}
