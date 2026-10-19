// Status:: done
// /memory — Multi-tier memory inspector and editor for Vecta CLI.
// Manages Tier 1 Global Preferences (general.json), Tier 2 Scoped CCM (CCM.json),
// and Tier 3 Per-Chat Summaries (summary.json).
// Enforces 700-word cap on cross-chat narratives, 350-word cap on chat summaries,
// safe double-tap deletion, collapsing bullet points, responsive horizontal lines,
// seamless Up/Down transition across sections, and Enter to edit/save.
// Strictly adheres to borderless aesthetic, conditional scrollbars, zero-emoji policy, and decoupled scrolling.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { useMemory } from "../hooks/useMemory.js";
import { formatCompactDate } from "../helpers/format.js";
import { type ScopeCCM, type ChatSummary, truncateWords } from "../../../state/memory.js";
import { isShiftEnter } from "../helpers/keyboard.js";

export interface MemoryViewProps {
  onClose: () => void;
  terminalSize: { columns: number; rows: number };
}

type MainTab = "chats" | "cross-chat";

type ViewState =
  | "root"
  | "chat-detail"
  | "scope-detail"
  | "global-prefs"
  | "input-add-point"
  | "input-edit-point"
  | "input-edit-narrative"
  | "input-add-pref"
  | "input-edit-pref"
  | "input-add-chat-point"
  | "input-edit-chat-point"
  | "input-edit-chat-narrative";

export const MemoryView: React.FC<MemoryViewProps> = ({ onClose, terminalSize }) => {
  const memory = useMemory();

  // Active top-level tab: "chats" (default) vs "cross-chat"
  const [mainTab, setMainTab] = useState<MainTab>("chats");

  // Navigation state
  const [view, setView] = useState<ViewState>("root");
  const [selectedChatIndex, setSelectedChatIndex] = useState(0);
  const [selectedScopeIndex, setSelectedScopeIndex] = useState(0);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);

  // Active chat detail data
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [activeChatData, setActiveChatData] = useState<ChatSummary | null>(null);

  // Active scope drill-down data
  const [activeScopeId, setActiveScopeId] = useState<string>("general");
  const [activeScopeData, setActiveScopeData] = useState<ScopeCCM | null>(null);

  // Focus area inside detail views: "keypoints" vs "narrative"
  const [detailFocus, setDetailFocus] = useState<"keypoints" | "narrative">("keypoints");

  // Inline input buffer
  const [inputBuffer, setInputBuffer] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  // Deletion double-tap safety tracker
  const [deletePendingIndex, setDeletePendingIndex] = useState<number | null>(null);

  // Tab-scoped feedback banner
  const [feedback, setFeedback] = useState<{ message: string; color: string } | null>(null);

  const showFeedback = useCallback((message: string, color: string = "green") => {
    setFeedback({ message, color });
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Sync active scope CCM whenever activeScopeId or memory data changes
  const { getCCM, scopes, getChat, chatMemories } = memory;
  useEffect(() => {
    if (view === "scope-detail" && activeScopeId) {
      const data = getCCM(activeScopeId);
      setActiveScopeData(data);
    }
  }, [view, activeScopeId, getCCM, scopes]);

  // Sync active chat summary whenever activeChatId changes
  useEffect(() => {
    if (view === "chat-detail" && activeChatId) {
      const data = getChat(activeChatId);
      setActiveChatData(data);
    }
  }, [view, activeChatId, getChat, chatMemories]);

  // Active chat title lookup
  const activeChatMeta = useMemo(() => {
    return memory.chatMemories.find((c) => c.chatId === activeChatId);
  }, [memory.chatMemories, activeChatId]);

  const activeChatTitle = useMemo(() => {
    if (!activeChatMeta) return activeChatId || "Chat";
    if (activeChatMeta.projectName) {
      return `[${activeChatMeta.projectName}] ${activeChatMeta.title}`;
    }
    return activeChatMeta.title;
  }, [activeChatMeta, activeChatId]);

  // Combined cross-chat root items: Option 0 is Global Preferences, then discovered scopes
  const rootScopeItems = useMemo(() => {
    return [
      {
        id: "global-preferences",
        name: "Global Preferences",
        type: "global" as const,
        keyPointsCount: memory.globalPreferences.length,
        narrativeWordCount: 0,
        updatedAt: new Date().toISOString(),
      },
      ...memory.scopes,
    ];
  }, [memory.globalPreferences, memory.scopes]);

  // Viewport calculation for lists
  const reservedHeaderRows = 8;
  const maxListVisible = Math.max(3, terminalSize.rows - reservedHeaderRows);

  // Scopes scroll calculation
  const maxScopeScroll = Math.max(0, rootScopeItems.length - maxListVisible);
  const [scopeScrollOffset, setScopeScrollOffset] = useState(0);

  // Chats scroll calculation
  const maxChatScroll = Math.max(0, memory.chatMemories.length - maxListVisible);
  const [chatScrollOffset, setChatScrollOffset] = useState(0);

  // Clamp selection index for scopes
  useEffect(() => {
    if (selectedScopeIndex >= rootScopeItems.length && rootScopeItems.length > 0) {
      setSelectedScopeIndex(rootScopeItems.length - 1);
    }
  }, [selectedScopeIndex, rootScopeItems.length]);

  // Clamp selection index for chats
  useEffect(() => {
    if (selectedChatIndex >= memory.chatMemories.length && memory.chatMemories.length > 0) {
      setSelectedChatIndex(memory.chatMemories.length - 1);
    }
  }, [selectedChatIndex, memory.chatMemories.length]);

  // Conditional scrollbar for scopes list
  const scopeScrollbar = useMemo(() => {
    if (rootScopeItems.length <= maxListVisible) return [];
    const scrollbarHeight = maxListVisible;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxListVisible / rootScopeItems.length) * scrollbarHeight))
    );
    const scrollRatio = maxScopeScroll > 0 ? scopeScrollOffset / maxScopeScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows: { index: number; isThumb: boolean }[] = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      rows.push({ index: i, isThumb: i >= thumbTop && i < thumbTop + thumbHeight });
    }
    return rows;
  }, [rootScopeItems.length, maxListVisible, maxScopeScroll, scopeScrollOffset]);

  // Conditional scrollbar for chats list
  const chatScrollbar = useMemo(() => {
    if (memory.chatMemories.length <= maxListVisible) return [];
    const scrollbarHeight = maxListVisible;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxListVisible / memory.chatMemories.length) * scrollbarHeight))
    );
    const scrollRatio = maxChatScroll > 0 ? chatScrollOffset / maxChatScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows: { index: number; isThumb: boolean }[] = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      rows.push({ index: i, isThumb: i >= thumbTop && i < thumbTop + thumbHeight });
    }
    return rows;
  }, [memory.chatMemories.length, maxListVisible, maxChatScroll, chatScrollOffset]);

  // Key input router
  useInput((input, key) => {
    // -------------------------------------------------------------------------
    // 1. INLINE TEXT INPUT MODES (Add / Edit)
    // -------------------------------------------------------------------------
    if (
      view === "input-add-point" ||
      view === "input-edit-point" ||
      view === "input-edit-narrative" ||
      view === "input-add-pref" ||
      view === "input-edit-pref" ||
      view === "input-add-chat-point" ||
      view === "input-edit-chat-point" ||
      view === "input-edit-chat-narrative"
    ) {
      // Shift+Enter: Inserts newline at cursor position
      if (isShiftEnter(key, input)) {
        const next = inputBuffer.slice(0, cursorPos) + "\n" + inputBuffer.slice(cursorPos);
        setInputBuffer(next);
        setCursorPos((prev) => prev + 1);
        return;
      }

      // Enter or Esc: Saves and exits
      if (key.escape || key.return || input === "\r" || input === "\n") {
        const text = inputBuffer.trim();
        if (view === "input-add-point") {
          if (text) {
            memory.addKeyPoint(activeScopeId, text);
            showFeedback("Added Key Point.");
          }
          setView("scope-detail");
        } else if (view === "input-edit-point") {
          if (text) {
            memory.updateKeyPoint(activeScopeId, selectedItemIndex, text);
            showFeedback("Updated Key Point.");
          }
          setView("scope-detail");
        } else if (view === "input-edit-narrative") {
          const finalNarrative = truncateWords(inputBuffer, 700);
          memory.setNarrative(activeScopeId, finalNarrative);
          showFeedback(`Saved narrative (${memory.countWords(finalNarrative)}/700 words).`);
          setView("scope-detail");
        } else if (view === "input-add-pref") {
          if (text) {
            memory.addGlobalPref(text);
            showFeedback("Added Global Preference.");
          }
          setView("global-prefs");
        } else if (view === "input-edit-pref") {
          if (text) {
            memory.updateGlobalPref(selectedItemIndex, text);
            showFeedback("Updated Global Preference.");
          }
          setView("global-prefs");
        } else if (view === "input-add-chat-point") {
          if (text) {
            memory.addChatPoint(activeChatId, text);
            showFeedback("Added Key Point to chat.");
          }
          setView("chat-detail");
        } else if (view === "input-edit-chat-point") {
          if (text) {
            memory.updateChatPoint(activeChatId, selectedItemIndex, text);
            showFeedback("Updated Key Point.");
          }
          setView("chat-detail");
        } else if (view === "input-edit-chat-narrative") {
          const finalNarrative = truncateWords(inputBuffer, 350);
          memory.setChatNarrative(activeChatId, finalNarrative);
          showFeedback(`Saved chat summary (${memory.countWords(finalNarrative)}/350 words).`);
          setView("chat-detail");
        }
        setInputBuffer("");
        setCursorPos(0);
        return;
      }

      // Ctrl+K: Clears the input buffer (matching PromptEditor)
      if (key.ctrl && (input === "k" || input === "K")) {
        setInputBuffer("");
        setCursorPos(0);
        return;
      }

      // Backspace
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const next = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos);
          setInputBuffer(next);
          setCursorPos((prev) => prev - 1);
        }
        return;
      }

      // Calculate lines and current cursor coordinates for Up/Down arrow navigation
      const rawLines = inputBuffer.split("\n");
      let cLine = 0;
      let cCol = 0;
      let charOffset = 0;
      for (let i = 0; i < rawLines.length; i++) {
        const lineLen = rawLines[i]!.length;
        if (cursorPos >= charOffset && cursorPos <= charOffset + lineLen) {
          cLine = i;
          cCol = cursorPos - charOffset;
          break;
        }
        charOffset += lineLen + 1;
      }

      // Up arrow: Move cursor to previous line
      if (key.upArrow) {
        if (cLine > 0) {
          let prevLineOffset = 0;
          for (let i = 0; i < cLine - 1; i++) {
            prevLineOffset += rawLines[i]!.length + 1;
          }
          const prevLineLen = rawLines[cLine - 1]!.length;
          const targetCol = Math.min(cCol, prevLineLen);
          setCursorPos(prevLineOffset + targetCol);
        } else {
          setCursorPos(0);
        }
        return;
      }

      // Down arrow: Move cursor to next line
      if (key.downArrow) {
        if (cLine < rawLines.length - 1) {
          let targetLineOffset = 0;
          for (let i = 0; i <= cLine; i++) {
            targetLineOffset += rawLines[i]!.length + 1;
          }
          const nextLineLen = rawLines[cLine + 1]!.length;
          const targetCol = Math.min(cCol, nextLineLen);
          setCursorPos(targetLineOffset + targetCol);
        } else {
          setCursorPos(inputBuffer.length);
        }
        return;
      }

      // Left / Right arrow navigation in input buffer
      if (key.leftArrow) {
        setCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos((prev) => Math.min(inputBuffer.length, prev + 1));
        return;
      }

      // Normal character typing
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        input !== "\r" &&
        input !== "\n" &&
        !input.startsWith("\x1b") &&
        !input.startsWith("[<")
      ) {
        const next = inputBuffer.slice(0, cursorPos) + input + inputBuffer.slice(cursorPos);
        setInputBuffer(next);
        setCursorPos((prev) => prev + input.length);
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 2. ROOT VIEW (Tab 1: Chats vs Tab 2: Cross Chat)
    // -------------------------------------------------------------------------
    if (view === "root") {
      // Tab switches between "chats" and "cross-chat"
      if (key.tab) {
        setMainTab((prev) => (prev === "chats" ? "cross-chat" : "chats"));
        return;
      }
      // Left / Right arrow also switches tabs at root level (Claude Docs 12 & 13)
      if (key.leftArrow) {
        setMainTab("chats");
        return;
      }
      if (key.rightArrow) {
        setMainTab("cross-chat");
        return;
      }

      // CHATS TAB NAVIGATION
      if (mainTab === "chats") {
        if (key.pageUp || input.startsWith("\x1b[<64;") || input.includes("<64;")) {
          setChatScrollOffset((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.pageDown || input.startsWith("\x1b[<65;") || input.includes("<65;")) {
          setChatScrollOffset((prev) => Math.min(maxChatScroll, prev + 1));
          return;
        }

        if (key.upArrow) {
          setSelectedChatIndex((prev) => {
            const next = Math.max(0, prev - 1);
            if (next < chatScrollOffset) setChatScrollOffset(next);
            return next;
          });
          return;
        }
        if (key.downArrow) {
          setSelectedChatIndex((prev) => {
            const next = Math.min(memory.chatMemories.length - 1, prev + 1);
            if (next >= chatScrollOffset + maxListVisible) {
              setChatScrollOffset(next - maxListVisible + 1);
            }
            return next;
          });
          return;
        }

        // Enter opens chat memory detail
        if (key.return) {
          const target = memory.chatMemories[selectedChatIndex];
          if (!target) return;
          setActiveChatId(target.chatId);
          setActiveChatData(memory.getChat(target.chatId));
          setSelectedItemIndex(0);
          setDetailFocus("keypoints");
          setDeletePendingIndex(null);
          setView("chat-detail");
          return;
        }

        if (key.escape) {
          onClose();
          return;
        }
        return;
      }

      // CROSS CHAT TAB NAVIGATION
      if (mainTab === "cross-chat") {
        if (key.pageUp || input.startsWith("\x1b[<64;") || input.includes("<64;")) {
          setScopeScrollOffset((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.pageDown || input.startsWith("\x1b[<65;") || input.includes("<65;")) {
          setScopeScrollOffset((prev) => Math.min(maxScopeScroll, prev + 1));
          return;
        }

        if (key.upArrow) {
          setSelectedScopeIndex((prev) => {
            const next = Math.max(0, prev - 1);
            if (next < scopeScrollOffset) setScopeScrollOffset(next);
            return next;
          });
          return;
        }
        if (key.downArrow) {
          setSelectedScopeIndex((prev) => {
            const next = Math.min(rootScopeItems.length - 1, prev + 1);
            if (next >= scopeScrollOffset + maxListVisible) {
              setScopeScrollOffset(next - maxListVisible + 1);
            }
            return next;
          });
          return;
        }

        // Enter drills into selected scope or global preferences
        if (key.return) {
          const target = rootScopeItems[selectedScopeIndex];
          if (!target) return;
          if (target.id === "global-preferences") {
            setSelectedItemIndex(0);
            setDeletePendingIndex(null);
            setView("global-prefs");
          } else {
            setActiveScopeId(target.id);
            setActiveScopeData(memory.getCCM(target.id));
            setSelectedItemIndex(0);
            setDetailFocus("keypoints");
            setDeletePendingIndex(null);
            setView("scope-detail");
          }
          return;
        }

        if (key.escape) {
          onClose();
          return;
        }
        return;
      }
    }

    // -------------------------------------------------------------------------
    // 3. CHAT DETAIL VIEW (Seamless Up/Down flow, Enter to edit)
    // -------------------------------------------------------------------------
    if (view === "chat-detail" && activeChatData) {
      const keyPoints = activeChatData.keyPoints;

      // Up arrow: seamlessly navigates keypoints or moves back up from narrative
      if (key.upArrow) {
        setDeletePendingIndex(null);
        if (detailFocus === "narrative") {
          setDetailFocus("keypoints");
          setSelectedItemIndex(Math.max(0, keyPoints.length - 1));
        } else {
          setSelectedItemIndex((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      // Down arrow: navigates down keypoints, and past last item moves into narrative
      if (key.downArrow) {
        setDeletePendingIndex(null);
        if (detailFocus === "keypoints") {
          if (keyPoints.length === 0 || selectedItemIndex >= keyPoints.length - 1) {
            setDetailFocus("narrative");
          } else {
            setSelectedItemIndex((prev) => prev + 1);
          }
        }
        return;
      }

      // Enter edits whatever cursor is on (Key Point or Chat Summary)
      if (key.return) {
        if (detailFocus === "keypoints") {
          if (keyPoints[selectedItemIndex]) {
            const currentPoint = keyPoints[selectedItemIndex] || "";
            setInputBuffer(currentPoint);
            setCursorPos(currentPoint.length);
            setView("input-edit-chat-point");
          }
        } else if (detailFocus === "narrative") {
          const text = activeChatData.narrative || "";
          setInputBuffer(text);
          setCursorPos(text.length);
          setView("input-edit-chat-narrative");
        }
        return;
      }

      // 'a' = Add Key Point to Chat
      if (input === "a" || input === "A") {
        setInputBuffer("");
        setCursorPos(0);
        setView("input-add-chat-point");
        return;
      }

      // 'd' = Delete Key Point with double-tap dd confirmation
      if (input === "d" || input === "D") {
        if (detailFocus === "keypoints" && keyPoints.length > 0) {
          if (deletePendingIndex === selectedItemIndex) {
            memory.removeChatPoint(activeChatId, selectedItemIndex);
            setDeletePendingIndex(null);
            showFeedback("Removed Key Point from chat.", "yellow");
            if (selectedItemIndex >= keyPoints.length - 1 && selectedItemIndex > 0) {
              setSelectedItemIndex(selectedItemIndex - 1);
            }
          } else {
            setDeletePendingIndex(selectedItemIndex);
          }
        }
        return;
      }

      // Esc returns to root chats list
      if (key.escape) {
        setDeletePendingIndex(null);
        setView("root");
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 4. GLOBAL PREFERENCES VIEW (Enter to edit)
    // -------------------------------------------------------------------------
    if (view === "global-prefs") {
      const prefs = memory.globalPreferences;

      if (key.upArrow) {
        setDeletePendingIndex(null);
        setSelectedItemIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setDeletePendingIndex(null);
        setSelectedItemIndex((prev) => Math.min(Math.max(0, prefs.length - 1), prev + 1));
        return;
      }

      // Enter edits selected preference
      if (key.return) {
        if (prefs[selectedItemIndex]) {
          const currentText = prefs[selectedItemIndex] || "";
          setInputBuffer(currentText);
          setCursorPos(currentText.length);
          setView("input-edit-pref");
        }
        return;
      }

      // 'a' = Add preference
      if (input === "a" || input === "A") {
        setInputBuffer("");
        setCursorPos(0);
        setView("input-add-pref");
        return;
      }

      // 'd' = Delete preference with double-tap dd confirmation
      if (input === "d" || input === "D") {
        if (prefs.length === 0) return;
        if (deletePendingIndex === selectedItemIndex) {
          memory.removeGlobalPref(selectedItemIndex);
          setDeletePendingIndex(null);
          showFeedback("Removed Global Preference.", "yellow");
          if (selectedItemIndex >= prefs.length - 1 && selectedItemIndex > 0) {
            setSelectedItemIndex(selectedItemIndex - 1);
          }
        } else {
          setDeletePendingIndex(selectedItemIndex);
        }
        return;
      }

      // Esc returns to root scopes list
      if (key.escape) {
        setDeletePendingIndex(null);
        setView("root");
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 5. SCOPE DETAIL VIEW (Seamless Up/Down flow, Enter to edit)
    // -------------------------------------------------------------------------
    if (view === "scope-detail" && activeScopeData) {
      const keyPoints = activeScopeData.keyPoints;

      // Up arrow: seamlessly navigates keypoints or moves back up from narrative
      if (key.upArrow) {
        setDeletePendingIndex(null);
        if (detailFocus === "narrative") {
          setDetailFocus("keypoints");
          setSelectedItemIndex(Math.max(0, keyPoints.length - 1));
        } else {
          setSelectedItemIndex((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      // Down arrow: navigates down keypoints, and past last item moves into narrative
      if (key.downArrow) {
        setDeletePendingIndex(null);
        if (detailFocus === "keypoints") {
          if (keyPoints.length === 0 || selectedItemIndex >= keyPoints.length - 1) {
            setDetailFocus("narrative");
          } else {
            setSelectedItemIndex((prev) => prev + 1);
          }
        }
        return;
      }

      // Enter edits whatever cursor is on (Key Point or Cross-Chat Narrative)
      if (key.return) {
        if (detailFocus === "keypoints") {
          if (keyPoints[selectedItemIndex]) {
            const currentPoint = keyPoints[selectedItemIndex] || "";
            setInputBuffer(currentPoint);
            setCursorPos(currentPoint.length);
            setView("input-edit-point");
          }
        } else if (detailFocus === "narrative") {
          const text = activeScopeData.narrative || "";
          setInputBuffer(text);
          setCursorPos(text.length);
          setView("input-edit-narrative");
        }
        return;
      }

      // 'a' = Add Key Point
      if (input === "a" || input === "A") {
        setInputBuffer("");
        setCursorPos(0);
        setView("input-add-point");
        return;
      }

      // 'd' = Delete Key Point with double-tap dd confirmation
      if (input === "d" || input === "D") {
        if (detailFocus === "keypoints" && keyPoints.length > 0) {
          if (deletePendingIndex === selectedItemIndex) {
            memory.removeKeyPoint(activeScopeId, selectedItemIndex);
            setDeletePendingIndex(null);
            showFeedback("Removed Key Point.", "yellow");
            if (selectedItemIndex >= keyPoints.length - 1 && selectedItemIndex > 0) {
              setSelectedItemIndex(selectedItemIndex - 1);
            }
          } else {
            setDeletePendingIndex(selectedItemIndex);
          }
        }
        return;
      }

      // Esc returns to scope list
      if (key.escape) {
        setDeletePendingIndex(null);
        setView("root");
        return;
      }
    }
  });

  // ===========================================================================
  // RENDER: INLINE INPUT OVERLAY (Dynamic Responsive Line Height)
  // ===========================================================================
  if (
    view === "input-add-point" ||
    view === "input-edit-point" ||
    view === "input-edit-narrative" ||
    view === "input-add-pref" ||
    view === "input-edit-pref" ||
    view === "input-add-chat-point" ||
    view === "input-edit-chat-point" ||
    view === "input-edit-chat-narrative"
  ) {
    const isNarrative = view === "input-edit-narrative" || view === "input-edit-chat-narrative";
    const maxWords = view === "input-edit-chat-narrative" ? 350 : 700;

    const promptTitle =
      view === "input-add-point"
        ? `Add Key Point (${activeScopeData?.scopeName || "Scope"})`
        : view === "input-edit-point"
        ? `Edit Key Point (${activeScopeData?.scopeName || "Scope"})`
        : view === "input-edit-narrative"
        ? `Edit Cross-Chat Narrative (${activeScopeData?.scopeName || "Scope"})`
        : view === "input-add-pref"
        ? "Add Global Preference"
        : view === "input-edit-pref"
        ? "Edit Global Preference"
        : view === "input-add-chat-point"
        ? `Add Key Point (${activeChatTitle})`
        : view === "input-edit-chat-point"
        ? `Edit Key Point (${activeChatTitle})`
        : `Edit Chat Summary (${activeChatTitle})`;

    const wordCount = memory.countWords(inputBuffer);
    const wordThresholdColor =
      wordCount > maxWords ? "red" : wordCount > Math.round(maxWords * 0.8) ? "yellow" : "gray";

    // Split buffer into lines and calculate active line/column
    const rawLines = inputBuffer.split("\n");
    let cLine = 0;
    let cCol = 0;
    let charOffset = 0;
    for (let i = 0; i < rawLines.length; i++) {
      const lineLen = rawLines[i]!.length;
      if (cursorPos >= charOffset && cursorPos <= charOffset + lineLen) {
        cLine = i;
        cCol = cursorPos - charOffset;
        break;
      }
      charOffset += lineLen + 1;
    }

    const maxVisibleLines = Math.max(4, terminalSize.rows - 10);
    const inputScrollOffset = cLine < maxVisibleLines ? 0 : cLine - maxVisibleLines + 1;
    const visibleLines = rawLines.slice(inputScrollOffset, inputScrollOffset + maxVisibleLines);

    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        paddingX={1}
        paddingY={0}
      >
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1} flexShrink={0}>
          <Text bold color="cyan">
            {promptTitle}
          </Text>
          {isNarrative ? (
            <Text color={wordThresholdColor}>
              Words: {wordCount} / {maxWords} cap
              {wordCount > maxWords && <Text color="yellow"> (auto-cuts to {maxWords} on exit)</Text>}
            </Text>
          ) : (
            <Text color="gray">{wordCount} words</Text>
          )}
        </Box>

        {/* Top Horizontal Line */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        </Box>

        {/* Clean Interactive Input Canvas - hugs text lines, dynamic height matching PromptEditor */}
        <Box
          flexDirection="column"
          height={Math.max(1, visibleLines.length)}
          flexShrink={0}
          paddingY={0}
          paddingX={0}
          marginBottom={0}
        >
          {inputBuffer.length === 0 ? (
            <Box flexDirection="row">
              <Text color="cyan" bold>{"> "}</Text>
              <Text color="cyan" inverse>{" "}</Text>
              <Text color="gray"> (type text instructions here... Shift+Enter for new line)</Text>
            </Box>
          ) : (
            visibleLines.map((lineText, idx) => {
              const actualLineIdx = inputScrollOffset + idx;
              const isLineActive = actualLineIdx === cLine;

              if (!isLineActive) {
                return (
                  <Box key={idx} height={1} flexDirection="row">
                    <Text color="gray">{"  "}</Text>
                    <Text>{lineText || " "}</Text>
                  </Box>
                );
              }

              const before = lineText.slice(0, cCol);
              const charAt = lineText[cCol] || " ";
              const after = lineText.slice(cCol + 1);

              return (
                <Box key={idx} height={1} flexDirection="row">
                  <Text color="cyan" bold>{"> "}</Text>
                  <Text>{before}</Text>
                  <Text color="cyan" inverse>
                    {charAt}
                  </Text>
                  <Text>{after}</Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Bottom Horizontal Line */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        </Box>

        {/* Status Bar Footer */}
        <Box flexShrink={0} marginTop={1}>
          <Text color="gray">Enter / Esc: save and exit   Shift+Enter: new line   Ctrl+K: clear</Text>
        </Box>
      </Box>
    );
  }

  // ===========================================================================
  // RENDER: CHAT DETAIL (Key Points + Chat Summary from summary.json)
  // ===========================================================================
  if (view === "chat-detail" && activeChatData) {
    const keyPoints = activeChatData.keyPoints;
    const narrativeWords = memory.countWords(activeChatData.narrative);

    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows - 1}
        paddingX={1}
      >
        {/* Header */}
        <Box marginBottom={1} flexShrink={0}>
          <Text bold color="cyan">
            {activeChatTitle}
          </Text>
          <Text dimColor> — Per-chat memory & summary</Text>
        </Box>

        {/* Tab-scoped feedback slot */}
        <Box height={1} marginY={0} flexShrink={0}>
          {feedback && <Text color={feedback.color}>{feedback.message}</Text>}
          {!feedback && deletePendingIndex !== null && (
            <Text color="yellow">Press d again to confirm removal</Text>
          )}
        </Box>

        {/* Main Body */}
        <Box flexDirection="column" flexGrow={1} marginY={0}>
          {/* Key Points Section */}
          <Box flexDirection="column" marginBottom={1} flexShrink={0}>
            <Box flexDirection="row" marginBottom={0}>
              <Text bold color={detailFocus === "keypoints" ? "cyan" : "gray"}>
                Key Points
              </Text>
              <Text dimColor> ({keyPoints.length} key points)</Text>
            </Box>

            {keyPoints.length === 0 ? (
              <Box marginY={0} marginLeft={2}>
                <Text dimColor>No key points recorded for this chat. Press 'a' to add one.</Text>
              </Box>
            ) : (
              keyPoints.map((pt, idx) => {
                const isSelected = detailFocus === "keypoints" && idx === selectedItemIndex;
                return (
                  <Box key={idx} flexDirection="row" flexShrink={0}>
                    <Box width={2} flexShrink={0}>
                      {isSelected ? (
                        <Text color="cyan" bold>{"> "}</Text>
                      ) : (
                        <Text color="gray">{"• "}</Text>
                      )}
                    </Box>
                    <Box flexGrow={1}>
                      <Text
                        bold={isSelected}
                        color={isSelected ? "white" : "gray"}
                        wrap="wrap"
                      >
                        {pt}
                      </Text>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>

          {/* Chat Summary Section (from summary.json, 350-word cap) */}
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="row" marginBottom={0} flexShrink={0}>
              <Text bold color={detailFocus === "narrative" ? "cyan" : "gray"}>
                Chat Summary
              </Text>
              <Text dimColor>
                {" "}
                ({narrativeWords} / 350 words cap)
              </Text>
            </Box>

            <Box
              flexGrow={1}
              flexDirection="row"
              marginLeft={0}
              marginY={0}
              padding={0}
            >
              <Box width={2} flexShrink={0}>
                {detailFocus === "narrative" ? (
                  <Text color="cyan" bold>{"> "}</Text>
                ) : (
                  <Text color="gray">{"  "}</Text>
                )}
              </Box>
              <Box flexGrow={1}>
                {activeChatData.narrative ? (
                  <Text
                    wrap="wrap"
                    color={detailFocus === "narrative" ? "white" : "gray"}
                    bold={detailFocus === "narrative"}
                  >
                    {activeChatData.narrative}
                  </Text>
                ) : (
                  <Text dimColor>
                    No chat summary recorded yet. Press Enter to author one.
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        </Box>

        <Box flexGrow={1} />

        {/* Shortcut Footer with horizontal line matching /roles */}
        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
          <Text color="gray">
            Up/Down: navigate   Enter: edit   a: add point   d: remove point   Esc: back
          </Text>
        </Box>
      </Box>
    );
  }

  // ===========================================================================
  // RENDER: GLOBAL PREFERENCES DETAIL
  // ===========================================================================
  if (view === "global-prefs") {
    const prefs = memory.globalPreferences;

    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows - 1}
        paddingX={1}
      >
        {/* Header */}
        <Box marginBottom={1} flexShrink={0}>
          <Text bold color="cyan">
            Global Preferences
          </Text>
          <Text dimColor> — Applied to every chat and project</Text>
        </Box>

        {/* Tab-scoped feedback slot */}
        <Box height={1} marginY={0} flexShrink={0}>
          {feedback && <Text color={feedback.color}>{feedback.message}</Text>}
          {!feedback && deletePendingIndex !== null && (
            <Text color="yellow">Press d again to confirm deletion</Text>
          )}
        </Box>

        {/* Content list with collapsing bullet point when selected */}
        <Box flexDirection="column" flexGrow={1} marginY={1}>
          {prefs.length === 0 ? (
            <Box marginY={1}>
              <Text dimColor>No global preferences recorded yet. Press 'a' to add one.</Text>
            </Box>
          ) : (
            prefs.map((pref, idx) => {
              const isSelected = idx === selectedItemIndex;
              return (
                <Box key={idx} flexDirection="row" marginY={0} flexShrink={0}>
                  <Box width={2} flexShrink={0}>
                    {isSelected ? (
                      <Text color="cyan" bold>{"> "}</Text>
                    ) : (
                      <Text color="gray">{"• "}</Text>
                    )}
                  </Box>
                  <Box flexGrow={1}>
                    <Text bold={isSelected} color={isSelected ? "white" : "gray"} wrap="wrap">
                      {pref}
                    </Text>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>

        <Box flexGrow={1} />

        {/* Shortcut Footer with horizontal line matching /roles */}
        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
          <Text color="gray">
            Up/Down: select   Enter: edit   a: add   d: remove (dd confirms)   Esc: back
          </Text>
        </Box>
      </Box>
    );
  }

  // ===========================================================================
  // RENDER: SCOPE DETAIL (Key Points + Cross-Chat Narrative)
  // ===========================================================================
  if (view === "scope-detail" && activeScopeData) {
    const keyPoints = activeScopeData.keyPoints;
    const narrativeWords = memory.countWords(activeScopeData.narrative);

    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows - 1}
        paddingX={1}
      >
        {/* Header */}
        <Box marginBottom={1} flexShrink={0}>
          <Text bold color="cyan">
            {activeScopeData.scopeName}
          </Text>
          <Text dimColor> — Cross-chat memory & permanent facts</Text>
        </Box>

        {/* Tab-scoped feedback slot */}
        <Box height={1} marginY={0} flexShrink={0}>
          {feedback && <Text color={feedback.color}>{feedback.message}</Text>}
          {!feedback && deletePendingIndex !== null && (
            <Text color="yellow">Press d again to confirm removal</Text>
          )}
        </Box>

        {/* Main Body */}
        <Box flexDirection="column" flexGrow={1} marginY={0}>
          {/* Key Points Section with collapsing bullet point when selected */}
          <Box flexDirection="column" marginBottom={1} flexShrink={0}>
            <Box flexDirection="row" marginBottom={0}>
              <Text bold color={detailFocus === "keypoints" ? "cyan" : "gray"}>
                Key Points
              </Text>
              <Text dimColor> ({keyPoints.length} key points)</Text>
            </Box>

            {keyPoints.length === 0 ? (
              <Box marginY={0} marginLeft={2}>
                <Text dimColor>No key points recorded. Press 'a' to add one.</Text>
              </Box>
            ) : (
              keyPoints.map((pt, idx) => {
                const isSelected = detailFocus === "keypoints" && idx === selectedItemIndex;
                return (
                  <Box key={idx} flexDirection="row" flexShrink={0}>
                    <Box width={2} flexShrink={0}>
                      {isSelected ? (
                        <Text color="cyan" bold>{"> "}</Text>
                      ) : (
                        <Text color="gray">{"• "}</Text>
                      )}
                    </Box>
                    <Box flexGrow={1}>
                      <Text
                        bold={isSelected}
                        color={isSelected ? "white" : "gray"}
                        wrap="wrap"
                      >
                        {pt}
                      </Text>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>

          {/* Cross-Chat Narrative Section */}
          <Box flexDirection="column" flexGrow={1}>
            <Box flexDirection="row" marginBottom={0} flexShrink={0}>
              <Text bold color={detailFocus === "narrative" ? "cyan" : "gray"}>
                Cross-Chat Narrative
              </Text>
              <Text dimColor>
                {" "}
                ({narrativeWords} / 700 words cap)
              </Text>
            </Box>

            <Box
              flexGrow={1}
              flexDirection="row"
              marginLeft={0}
              marginY={0}
              padding={0}
            >
              <Box width={2} flexShrink={0}>
                {detailFocus === "narrative" ? (
                  <Text color="cyan" bold>{"> "}</Text>
                ) : (
                  <Text color="gray">{"  "}</Text>
                )}
              </Box>
              <Box flexGrow={1}>
                {activeScopeData.narrative ? (
                  <Text
                    wrap="wrap"
                    color={detailFocus === "narrative" ? "white" : "gray"}
                    bold={detailFocus === "narrative"}
                  >
                    {activeScopeData.narrative}
                  </Text>
                ) : (
                  <Text dimColor>
                    No cross-chat story recorded yet. Press Enter to author one.
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        </Box>

        <Box flexGrow={1} />

        {/* Shortcut Footer with horizontal line matching /roles */}
        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
          <Text color="gray">
            Up/Down: navigate   Enter: edit   a: add point   d: remove point   Esc: back
          </Text>
        </Box>
      </Box>
    );
  }

  // ===========================================================================
  // RENDER: ROOT VIEW (Tabs: Chats vs Cross Chat)
  // ===========================================================================
  const visibleScopes = rootScopeItems.slice(scopeScrollOffset, scopeScrollOffset + maxListVisible);
  const visibleChats = memory.chatMemories.slice(chatScrollOffset, chatScrollOffset + maxListVisible);

  return (
    <Box
      flexDirection="column"
      width={terminalSize.columns}
      height={terminalSize.rows - 1}
      paddingX={1}
    >
      {/* Top Tab Bar */}
      <Box flexDirection="row" gap={2} marginBottom={1} flexShrink={0}>
        <Box flexDirection="row">
          <Text
            bold
            color={mainTab === "chats" ? "cyan" : "gray"}
            inverse={mainTab === "chats"}
          >
            {" "}Chats{" "}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text
            bold
            color={mainTab === "cross-chat" ? "cyan" : "gray"}
            inverse={mainTab === "cross-chat"}
          >
            {" "}Cross Chat{" "}
          </Text>
        </Box>
      </Box>

      {/* Tab-scoped feedback slot */}
      <Box height={1} marginY={0} flexShrink={0}>
        {feedback && <Text color={feedback.color}>{feedback.message}</Text>}
      </Box>

      {/* =======================================================================
          TAB 1: CHATS (Individual chat summaries)
         ======================================================================= */}
      {mainTab === "chats" && (
        <Box flexDirection="column" flexGrow={1}>
          {/* Table Headers */}
          <Box flexDirection="row" marginBottom={0} flexShrink={0}>
            <Box width={3} flexShrink={0}>
              <Text dimColor> </Text>
            </Box>
            <Box width={34} flexShrink={0}>
              <Text bold dimColor>
                Chat Name
              </Text>
            </Box>
            <Box width={16} flexShrink={0}>
              <Text bold dimColor>
                Key Points
              </Text>
            </Box>
            <Box width={16} flexShrink={0}>
              <Text bold dimColor>
                Chat Summary
              </Text>
            </Box>
          </Box>

          {/* Chats List or Empty State */}
          <Box flexDirection="row" flexGrow={1} marginY={0}>
            <Box flexDirection="column" flexGrow={1}>
              {memory.chatMemories.length === 0 ? (
                <Box marginY={1}>
                  <Text dimColor>No chats found yet. Start a chat in the CLI to see its memory here.</Text>
                </Box>
              ) : (
                visibleChats.map((item, visibleIdx) => {
                  const actualIdx = chatScrollOffset + visibleIdx;
                  const isSelected = actualIdx === selectedChatIndex;
                  const displayName = item.projectName
                    ? `[${item.projectName}] ${item.title}`
                    : item.title;

                  return (
                    <Box key={item.chatId} flexDirection="row" flexShrink={0} marginY={0}>
                      <Box width={3} flexShrink={0}>
                        <Text color={isSelected ? "cyan" : "gray"}>
                          {isSelected ? "›" : " "}
                        </Text>
                      </Box>
                      <Box width={34} flexShrink={0}>
                        <Text
                          bold={isSelected}
                          color={isSelected ? "cyan" : "white"}
                        >
                          {displayName.length > 32 ? displayName.slice(0, 31) + "…" : displayName}
                        </Text>
                      </Box>
                      <Box width={16} flexShrink={0}>
                        <Text dimColor={!isSelected} color={isSelected ? "white" : undefined}>
                          {item.keyPointsCount} key points
                        </Text>
                      </Box>
                      <Box width={16} flexShrink={0}>
                        <Text dimColor={!isSelected} color={isSelected ? "white" : undefined}>
                          {item.narrativeWordCount} words
                        </Text>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>

            {/* Scrollbar rail: renders IF AND ONLY IF items exceed viewport */}
            {chatScrollbar.length > 0 && (
              <Box flexDirection="column" width={1} flexShrink={0}>
                {chatScrollbar.map((row) => (
                  <Text key={row.index} color={row.isThumb ? "cyan" : "gray"}>
                    {row.isThumb ? "█" : "│"}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* =======================================================================
          TAB 2: CROSS CHAT (Global Preferences & Scoped CCMs)
         ======================================================================= */}
      {mainTab === "cross-chat" && (
        <Box flexDirection="column" flexGrow={1}>
          {/* Table Headers */}
          <Box flexDirection="row" marginBottom={0} flexShrink={0}>
            <Box width={3} flexShrink={0}>
              <Text dimColor> </Text>
            </Box>
            <Box width={34} flexShrink={0}>
              <Text bold dimColor>
                Scope Name
              </Text>
            </Box>
            <Box width={16} flexShrink={0}>
              <Text bold dimColor>
                Key Points
              </Text>
            </Box>
            <Box width={16} flexShrink={0}>
              <Text bold dimColor>
                Narrative
              </Text>
            </Box>
          </Box>

          {/* Scopes List and Conditional Scrollbar */}
          <Box flexDirection="row" flexGrow={1} marginY={0}>
            <Box flexDirection="column" flexGrow={1}>
              {visibleScopes.map((item, visibleIdx) => {
                const actualIdx = scopeScrollOffset + visibleIdx;
                const isSelected = actualIdx === selectedScopeIndex;

                return (
                  <Box key={item.id} flexDirection="row" flexShrink={0} marginY={0}>
                    <Box width={3} flexShrink={0}>
                      <Text color={isSelected ? "cyan" : "gray"}>
                        {isSelected ? "›" : " "}
                      </Text>
                    </Box>
                    <Box width={34} flexShrink={0}>
                      <Text
                        bold={isSelected}
                        color={isSelected ? "cyan" : item.type === "global" ? "yellow" : "white"}
                      >
                        {item.name}
                      </Text>
                    </Box>
                    <Box width={16} flexShrink={0}>
                      <Text dimColor={!isSelected} color={isSelected ? "white" : undefined}>
                        {item.keyPointsCount} key points
                      </Text>
                    </Box>
                    <Box width={16} flexShrink={0}>
                      <Text dimColor={!isSelected} color={isSelected ? "white" : undefined}>
                        {item.type === "global" ? "None" : `${item.narrativeWordCount} words`}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            {/* Scrollbar rail: renders IF AND ONLY IF items exceed viewport */}
            {scopeScrollbar.length > 0 && (
              <Box flexDirection="column" width={1} flexShrink={0}>
                {scopeScrollbar.map((row) => (
                  <Text key={row.index} color={row.isThumb ? "cyan" : "gray"}>
                    {row.isThumb ? "█" : "│"}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      <Box flexGrow={1} />

      {/* Shortcut Footer with horizontal line matching /roles */}
      <Box marginTop={1} flexDirection="column" flexShrink={0}>
        <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        <Text color="gray">
          {mainTab === "chats"
            ? "Tab: switch to Cross Chat   Up/Down: navigate   Enter: open chat memory   Esc: close"
            : "Tab: switch to Chats   Up/Down: navigate   Enter: open scope   Esc: close"}
        </Text>
      </Box>
    </Box>
  );
};
