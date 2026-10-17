// Status:: complete
// /chats — List, create, rename, pin, delete, and switch chats.
// Strictly adheres to zero-emoji design, 3-column / 4-column aligned table layout, separate General Chats & Project Chats sections, responsive wrapping, and decoupled touchpad scrolling.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { chatService, type ChatMetadata, type ProjectMetadata } from "../services/chat-service.js";
import { formatCompactDate } from "../helpers/format.js";

export interface ChatsViewProps {
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  activeChatId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  onBack?: () => void;
  terminalSize: { columns: number; rows: number };
}

type Mode = "list" | "create" | "rename" | "confirm-delete";

type SelectableItem =
  | { type: "new" }
  | { type: "chat"; chat: ChatMetadata; isProject: boolean; projectName?: string };

type RosterRow =
  | { key: string; navIndex: number; isNew: true }
  | { key: string; isHeader: true; headerTitle: string }
  | { key: string; isPlaceholder: true; text: string }
  | {
      key: string;
      navIndex: number;
      chat: ChatMetadata;
      isProject: boolean;
      projectName?: string;
    };

export const ChatsView: React.FC<ChatsViewProps> = ({
  onClose,
  onSelectChat,
  activeChatId,
  projectId,
  projectName,
  onBack,
  terminalSize,
}) => {
  const [chats, setChats] = useState<ChatMetadata[]>([]);
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [inputBuffer, setInputBuffer] = useState("");

  // Load chats and projects from persistent storage
  const refreshData = useCallback(() => {
    const chatList = chatService.listChats(projectId);
    setChats(chatList);
    const projList = chatService.listProjects();
    setProjects(projList);
  }, [projectId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Project lookup map (id -> name)
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projects]);

  // Partition chats into General (standalone) and Project-scoped
  const generalChats = useMemo(() => {
    return chats.filter((c) => !c.projectId);
  }, [chats]);

  const projectChats = useMemo(() => {
    return chats.filter((c) => Boolean(c.projectId));
  }, [chats]);

  // Flat list of selectable items (Navigable by Up/Down keys)
  const selectableItems = useMemo<SelectableItem[]>(() => {
    const items: SelectableItem[] = [{ type: "new" }];
    if (projectId) {
      for (const c of projectChats) {
        items.push({ type: "chat", chat: c, isProject: false });
      }
    } else {
      for (const c of generalChats) {
        items.push({ type: "chat", chat: c, isProject: false });
      }
      for (const c of projectChats) {
        const pName = projectMap.get(c.projectId || "") || "Project";
        items.push({ type: "chat", chat: c, isProject: true, projectName: pName });
      }
    }
    return items;
  }, [projectId, generalChats, projectChats, projectMap]);

  const totalItems = selectableItems.length;

  // Visual roster rows (including section headers and items)
  const allRows = useMemo<RosterRow[]>(() => {
    const rows: RosterRow[] = [];
    rows.push({ key: "row-new-chat", navIndex: 0, isNew: true });

    if (projectId) {
      // Scoped to a specific project workspace
      rows.push({
        key: "hdr-project-scoped",
        isHeader: true,
        headerTitle: `Project Chats: ${projectName || "Project"} (${projectChats.length})`,
      });
      if (projectChats.length === 0) {
        rows.push({ key: "empty-scoped", isPlaceholder: true, text: "No chats in this project yet" });
      } else {
        projectChats.forEach((c, i) => {
          rows.push({
            key: `chat-${c.id}`,
            navIndex: 1 + i,
            chat: c,
            isProject: false,
          });
        });
      }
    } else {
      // General standalone chats section (3 columns)
      rows.push({
        key: "hdr-general",
        isHeader: true,
        headerTitle: `General Chats (${generalChats.length})`,
      });
      if (generalChats.length === 0) {
        rows.push({ key: "empty-general", isPlaceholder: true, text: "No standalone general chats" });
      } else {
        generalChats.forEach((c, i) => {
          rows.push({
            key: `chat-${c.id}`,
            navIndex: 1 + i,
            chat: c,
            isProject: false,
          });
        });
      }

      // Project chats section (4 columns: name, project, messages, last edited)
      rows.push({
        key: "hdr-project",
        isHeader: true,
        headerTitle: `Project Chats (${projectChats.length})`,
      });
      if (projectChats.length === 0) {
        rows.push({ key: "empty-project", isPlaceholder: true, text: "No project chats yet" });
      } else {
        projectChats.forEach((c, i) => {
          const pName = projectMap.get(c.projectId || "") || "Project";
          rows.push({
            key: `chat-${c.id}`,
            navIndex: 1 + generalChats.length + i,
            chat: c,
            isProject: true,
            projectName: pName,
          });
        });
      }
    }

    return rows;
  }, [projectId, projectName, generalChats, projectChats, projectMap]);

  const totalRows = allRows.length;
  const reservedRows = 6;
  const availableItemRows = Math.max(3, terminalSize.rows - reservedRows);
  const maxVisible = availableItemRows;
  const maxScroll = Math.max(0, totalRows - maxVisible);

  // Clamp selection index if list shrunk
  useEffect(() => {
    if (selectedIndex >= totalItems && totalItems > 0) {
      setSelectedIndex(totalItems - 1);
    }
  }, [totalItems, selectedIndex]);

  // Clamp scroll offset
  useEffect(() => {
    if (scrollOffset > maxScroll) {
      setScrollOffset(maxScroll);
    }
  }, [maxScroll, scrollOffset]);

  const visibleRows = allRows.slice(scrollOffset, scrollOffset + maxVisible);

  // Scrollbar rail calculation: ONLY appears when terminal size is small or items exceed view (matching agent-roles.tsx)
  const scrollbarRows = useMemo(() => {
    if (totalRows <= maxVisible) {
      return [];
    }
    const scrollbarHeight = maxVisible;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxVisible / totalRows) * scrollbarHeight))
    );
    const scrollRatio = maxScroll > 0 ? scrollOffset / maxScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows: { index: number; isThumb: boolean }[] = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      rows.push({ index: i, isThumb });
    }
    return rows;
  }, [totalRows, maxVisible, maxScroll, scrollOffset]);

  useInput((input, key) => {
    // -------------------------------------------------------------------------
    // TOUCHPAD & MOUSE WHEEL SCROLLING: SCROLLS PAGE / SCROLLBAR ONLY
    // -------------------------------------------------------------------------
    const isWheelUp =
      key.pageUp ||
      input === "\x1b[5~" ||
      input.startsWith("\x1b[<64;") ||
      input.includes("<64;") ||
      input.startsWith("[<64;");

    const isWheelDown =
      key.pageDown ||
      input === "\x1b[6~" ||
      input.startsWith("\x1b[<65;") ||
      input.includes("<65;") ||
      input.startsWith("[<65;");

    if (isWheelUp) {
      if (mode === "list") {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (isWheelDown) {
      if (mode === "list") {
        setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
      }
      return;
    }

    // Ignore other SGR mouse sequences (clicks/drags) so they never leak into buffers
    if (
      input.startsWith("\x1b[<") ||
      input.startsWith("[<") ||
      input === "[4" ||
      /^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input)
    ) {
      return;
    }

    const selectedItem = selectableItems[selectedIndex];
    const targetChat = selectedItem && selectedItem.type === "chat" ? selectedItem.chat : null;

    // -------------------------------------------------------------------------
    // RENAME MODE
    // -------------------------------------------------------------------------
    if (mode === "rename") {
      if (key.escape) {
        setMode("list");
        setInputBuffer("");
        return;
      }
      if (key.return) {
        if (targetChat && inputBuffer.trim()) {
          chatService.renameChat(targetChat.id, inputBuffer.trim());
          refreshData();
        }
        setMode("list");
        setInputBuffer("");
        return;
      }
      if (key.backspace || key.delete) {
        setInputBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputBuffer((prev) => prev + input);
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // CREATE MODE
    // -------------------------------------------------------------------------
    if (mode === "create") {
      if (key.escape) {
        setMode("list");
        setInputBuffer("");
        return;
      }
      if (key.return) {
        const newChat = chatService.createChat(inputBuffer.trim() || undefined, projectId);
        setMode("list");
        setInputBuffer("");
        onSelectChat(newChat.id);
        return;
      }
      if (key.backspace || key.delete) {
        setInputBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputBuffer((prev) => prev + input);
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // CONFIRM DELETE MODE
    // -------------------------------------------------------------------------
    if (mode === "confirm-delete") {
      if (input === "d" || input === "D") {
        if (targetChat) {
          chatService.deleteChat(targetChat.id);
          refreshData();
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        }
        setMode("list");
        return;
      }
      // Any other key cancels deletion
      setMode("list");
      return;
    }

    // -------------------------------------------------------------------------
    // LIST NAVIGATION MODE
    // -------------------------------------------------------------------------
    if (key.escape) {
      if (onBack) {
        onBack();
      } else {
        onClose();
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        const targetRowIdx = allRows.findIndex((r) => "navIndex" in r && r.navIndex === next);
        if (targetRowIdx !== -1) {
          if (targetRowIdx < scrollOffset) {
            setScrollOffset(targetRowIdx);
          } else if (targetRowIdx >= scrollOffset + maxVisible) {
            setScrollOffset(targetRowIdx - maxVisible + 1);
          }
        }
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(totalItems - 1, prev + 1);
        const targetRowIdx = allRows.findIndex((r) => "navIndex" in r && r.navIndex === next);
        if (targetRowIdx !== -1) {
          if (targetRowIdx >= scrollOffset + maxVisible) {
            setScrollOffset(targetRowIdx - maxVisible + 1);
          } else if (targetRowIdx < scrollOffset) {
            setScrollOffset(targetRowIdx);
          }
        }
        return next;
      });
      return;
    }

    // Enter key
    if (key.return) {
      if (selectedIndex === 0) {
        // Option 0: New chat
        setMode("create");
        setInputBuffer("");
        return;
      }
      if (targetChat) {
        onSelectChat(targetChat.id);
      }
      return;
    }

    // Pin toggle
    if (input === "p" || input === "P") {
      if (targetChat) {
        chatService.togglePinChat(targetChat.id);
        refreshData();
      }
      return;
    }

    // Rename
    if (input === "r" || input === "R") {
      if (targetChat) {
        setMode("rename");
        setInputBuffer(targetChat.title);
      }
      return;
    }

    // Delete
    if (input === "d" || input === "D") {
      if (targetChat) {
        setMode("confirm-delete");
      }
      return;
    }
  });

  const availableWidth = Math.max(30, terminalSize.columns - 4);
  const isNarrow3 = availableWidth < 70;
  const isNarrow4 = availableWidth < 85;

  // 3 columns layout calculations: Name, Messages, Last Edited
  const colMsgsWidth = 12;
  const colDateWidth = 24;
  const colNameWidth3 = Math.max(16, availableWidth - colMsgsWidth - colDateWidth - 4);

  // 4 columns layout calculations: Name, Project, Messages, Last Edited
  const colProjWidth = 18;
  const colMsgsWidth4 = 12;
  const colDateWidth4 = 24;
  const colNameWidth4 = Math.max(16, availableWidth - colProjWidth - colMsgsWidth4 - colDateWidth4 - 6);

  return (
    <Box flexDirection="column" width={terminalSize.columns} paddingX={1}>
      {/* Top Banner with normal clean font */}
      <Box flexDirection="column" marginBottom={1} flexShrink={0}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="row" gap={2}>
            <Text bold color="cyan">
              Chats
            </Text>
            <Text color="gray">
              {projectName ? `[Project: ${projectName}]` : "[Scope: Standalone & Project]"}
            </Text>
            <Text color="cyan" bold>
              ({chats.length} {chats.length === 1 ? "chat" : "chats"})
            </Text>
          </Box>
          <Text color="gray">{onBack ? "Esc: Back to Projects" : "Esc: Close"}</Text>
        </Box>
        <Text color="cyan">{"━".repeat(Math.max(10, availableWidth))}</Text>
      </Box>

      {/* Main Content Area with side-by-side scrollbar (only when items exceed view) */}
      <Box flexDirection="row" width="100%" justifyContent="space-between" flexShrink={0}>
        {/* Left: 1-line compact cards list with section headers */}
        <Box flexDirection="column" flexGrow={1}>
          {visibleRows.map((row) => {
            // Case 1: Section Header
            if ("isHeader" in row && row.isHeader) {
              return (
                <Box
                  key={row.key}
                  height={1}
                  flexShrink={0}
                  marginTop={row.key === "hdr-general" || row.key === "hdr-project-scoped" ? 0 : 1}
                >
                  <Text bold color="cyan">{row.headerTitle}</Text>
                </Box>
              );
            }

            // Case 2: Placeholder
            if ("isPlaceholder" in row && row.isPlaceholder) {
              return (
                <Box key={row.key} height={1} flexShrink={0} marginLeft={3}>
                  <Text color="gray" italic>{row.text}</Text>
                </Box>
              );
            }

            // Case 3: Option 0 (+ New chat)
            if ("isNew" in row && row.isNew) {
              const isSelected = selectedIndex === 0;
              if (isSelected && mode === "create") {
                return (
                  <Box key="new-chat-create" height={1} flexDirection="row" flexShrink={0}>
                    <Text color="cyan" bold>{">  "}</Text>
                    <Text color="yellow" bold>New chat title: </Text>
                    <Text color="white" bold>{inputBuffer}</Text>
                    <Text color="cyan">_</Text>
                    <Text color="gray">   (Enter to create, Esc to cancel)</Text>
                  </Box>
                );
              }

              return (
                <Box key="new-chat-item" height={1} flexDirection="row" flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                    {isSelected ? ">  " : "   "}
                  </Text>
                  <Text color={isSelected ? "cyan" : "white"} bold>
                    + New chat {projectName ? `(in ${projectName})` : ""}
                  </Text>
                  <Text color="gray">   •   Start a fresh conversation session</Text>
                </Box>
              );
            }

            // Case 4: Chat Row (General 3-col or Project 4-col)
            if ("chat" in row) {
              const chat = row.chat;
              const isSelected = selectedIndex === row.navIndex;
              const isCurrent = chat.id === activeChatId;

              // Inline rename mode
              if (isSelected && mode === "rename") {
                return (
                  <Box key={chat.id} height={1} flexDirection="row" flexShrink={0}>
                    <Text color="yellow" bold>{">  "}</Text>
                    <Text color="yellow" bold>Rename: </Text>
                    <Text color="white" bold>{inputBuffer}</Text>
                    <Text color="yellow">_</Text>
                    <Text color="gray">   (Enter to save, Esc to cancel)</Text>
                  </Box>
                );
              }

              // Inline delete confirmation mode
              if (isSelected && mode === "confirm-delete") {
                return (
                  <Box key={chat.id} height={1} flexDirection="row" flexShrink={0}>
                    <Text color="red" bold>{">  "}</Text>
                    <Text color="red" bold>Delete &quot;{chat.title}&quot;? </Text>
                    <Text color="red">(Press &apos;d&apos; to confirm deletion, Esc to cancel)</Text>
                  </Box>
                );
              }

              const pinTag = chat.pinned ? "[PIN] " : "";
              const dateStr = formatCompactDate(chat.updatedAt);

              if (row.isProject) {
                // 4 Columns: Name, Project, Messages, Last Edited
                if (!isNarrow4) {
                  return (
                    <Box key={chat.id} height={1} flexDirection="row" width="100%" flexShrink={0}>
                      <Box width={colNameWidth4} flexShrink={0} flexDirection="row">
                        <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                          {isSelected ? ">  " : "   "}
                        </Text>
                        {pinTag ? <Text color="cyan" bold>{pinTag}</Text> : null}
                        <Text color={isSelected ? "cyan" : "white"} bold wrap="truncate-end">
                          {chat.title}
                        </Text>
                        {isCurrent && <Text color="green" bold>   [CURRENT]</Text>}
                      </Box>
                      <Box width={colProjWidth} flexShrink={0}>
                        <Text color="blue" wrap="truncate-end">
                          [Project: {row.projectName}]
                        </Text>
                      </Box>
                      <Box width={colMsgsWidth4} flexShrink={0}>
                        <Text color="cyan">
                          [{chat.messageCount} {chat.messageCount === 1 ? "msg" : "msgs"}]
                        </Text>
                      </Box>
                      <Box width={colDateWidth4} flexShrink={0}>
                        <Text color="gray">Last edited: {dateStr}</Text>
                      </Box>
                    </Box>
                  );
                } else {
                  // Narrow: wraps onto 2 lines cleanly
                  return (
                    <Box key={chat.id} flexDirection="column" width="100%" flexShrink={0}>
                      <Box flexDirection="row" width="100%">
                        <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                          {isSelected ? ">  " : "   "}
                        </Text>
                        {pinTag ? <Text color="cyan" bold>{pinTag}</Text> : null}
                        <Text color={isSelected ? "cyan" : "white"} bold wrap="truncate-end">
                          {chat.title}
                        </Text>
                        {isCurrent && <Text color="green" bold>   [CURRENT]</Text>}
                      </Box>
                      <Box marginLeft={3} flexDirection="row" gap={2} flexWrap="wrap">
                        <Text color="blue">[Project: {row.projectName}]</Text>
                        <Text color="cyan">
                          [{chat.messageCount} {chat.messageCount === 1 ? "msg" : "msgs"}]
                        </Text>
                        <Text color="gray">Last edited: {dateStr}</Text>
                      </Box>
                    </Box>
                  );
                }
              } else {
                // 3 Columns: Name, Messages, Last Edited
                if (!isNarrow3) {
                  return (
                    <Box key={chat.id} height={1} flexDirection="row" width="100%" flexShrink={0}>
                      <Box width={colNameWidth3} flexShrink={0} flexDirection="row">
                        <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                          {isSelected ? ">  " : "   "}
                        </Text>
                        {pinTag ? <Text color="cyan" bold>{pinTag}</Text> : null}
                        <Text color={isSelected ? "cyan" : "white"} bold wrap="truncate-end">
                          {chat.title}
                        </Text>
                        {isCurrent && <Text color="green" bold>   [CURRENT]</Text>}
                      </Box>
                      <Box width={colMsgsWidth} flexShrink={0}>
                        <Text color="cyan">
                          [{chat.messageCount} {chat.messageCount === 1 ? "msg" : "msgs"}]
                        </Text>
                      </Box>
                      <Box width={colDateWidth} flexShrink={0}>
                        <Text color="gray">Last edited: {dateStr}</Text>
                      </Box>
                    </Box>
                  );
                } else {
                  // Narrow: wraps onto 2 lines cleanly
                  return (
                    <Box key={chat.id} flexDirection="column" width="100%" flexShrink={0}>
                      <Box flexDirection="row" width="100%">
                        <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                          {isSelected ? ">  " : "   "}
                        </Text>
                        {pinTag ? <Text color="cyan" bold>{pinTag}</Text> : null}
                        <Text color={isSelected ? "cyan" : "white"} bold wrap="truncate-end">
                          {chat.title}
                        </Text>
                        {isCurrent && <Text color="green" bold>   [CURRENT]</Text>}
                      </Box>
                      <Box marginLeft={3} flexDirection="row" gap={3}>
                        <Text color="cyan">
                          [{chat.messageCount} {chat.messageCount === 1 ? "msg" : "msgs"}]
                        </Text>
                        <Text color="gray">Last edited: {dateStr}</Text>
                      </Box>
                    </Box>
                  );
                }
              }
            }

            return null;
          })}
        </Box>

        {/* Right: Smooth Web Scrollbar Rail (ONLY appears when terminal size is small or items exceed view) */}
        {scrollbarRows.length > 0 && (
          <Box flexDirection="column" width={1} marginLeft={2} flexShrink={0}>
            {scrollbarRows.map((row) => (
              <Box key={`sb-${row.index}`} height={1}>
                {row.isThumb ? (
                  <Text color="cyan" bold>█</Text>
                ) : (
                  <Text> </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Elevated Footer Shortcut Bar (guaranteed visible and wraps on small terminals) */}
      <Box flexShrink={0} marginTop={1} flexDirection="column" width="100%">
        <Text color="gray">{"─".repeat(Math.max(10, availableWidth))}</Text>
        <Box flexDirection="row" flexWrap="wrap" marginTop={1} width="100%" flexShrink={0}>
          {mode === "create" || mode === "rename" ? (
            <>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ Enter ]</Text>
                <Text color="white"> confirm</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="yellow" bold>[ Esc ]</Text>
                <Text color="white"> cancel</Text>
              </Box>
            </>
          ) : mode === "confirm-delete" ? (
            <>
              <Box marginRight={2} flexShrink={0}>
                <Text color="red" bold>[ d ]</Text>
                <Text color="white"> confirm delete</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="yellow" bold>[ Esc ]</Text>
                <Text color="white"> cancel</Text>
              </Box>
            </>
          ) : (
            <>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ ↑/↓ ]</Text>
                <Text color="white"> select</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ Enter ]</Text>
                <Text color="white"> open</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ p ]</Text>
                <Text color="white"> pin</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ r ]</Text>
                <Text color="white"> rename</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ d ]</Text>
                <Text color="white"> delete</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="yellow" bold>[ Esc ]</Text>
                <Text color="white"> {onBack ? "back to projects" : "close"}</Text>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};
