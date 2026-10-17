// Status:: complete
// /projects — Project workspace manager, cascading or standalone deletion, and scoped chat drill-down.
// Strictly adheres to zero-emoji design, grand 2-line card layout, elevated visible shortcuts, permanent scrollbar rail, and cross-OS touchpad scrolling.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { chatService, type ProjectMetadata } from "../services/chat-service.js";
import { formatCompactDate } from "../helpers/format.js";
import { ChatsView } from "./chats.js";

export interface ProjectsViewProps {
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  activeChatId?: string | null;
  terminalSize: { columns: number; rows: number };
}

type Mode = "list" | "create" | "rename" | "confirm-delete";

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  onClose,
  onSelectChat,
  activeChatId,
  terminalSize,
}) => {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [inputBuffer, setInputBuffer] = useState("");
  const [drilledProjectId, setDrilledProjectId] = useState<string | null>(null);

  // Refresh projects from storage
  const refreshProjects = useCallback(() => {
    const list = chatService.listProjects();
    setProjects(list);
  }, []);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Total items = 1 (Option 0: + New project) + projects.length
  const totalItems = projects.length + 1;

  // Dynamic layout & responsive scrolling (1-row items)
  const reservedRows = 6;
  const availableItemRows = Math.max(3, terminalSize.rows - reservedRows);
  const itemHeight = 1;
  const maxVisible = availableItemRows;
  const maxScroll = Math.max(0, totalItems - maxVisible);

  // Clamp selection index
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

  const startIndex = scrollOffset;
  const visibleCount = Math.min(totalItems - startIndex, maxVisible);

  // Scrollbar rail calculation: ONLY appears when terminal size is small or items exceed view (matching agent-roles.tsx)
  const scrollbarRows = useMemo(() => {
    if (totalItems <= maxVisible) {
      return [];
    }
    const scrollbarHeight = maxVisible;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxVisible / totalItems) * scrollbarHeight))
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
  }, [totalItems, maxVisible, maxScroll, scrollOffset]);

  useInput((input, key) => {
    // If drilled down into a project's chats, let ChatsView handle all keyboard events
    if (drilledProjectId) {
      return;
    }

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
        const targetProj = projects[selectedIndex - 1];
        if (targetProj && inputBuffer.trim()) {
          chatService.renameProject(targetProj.id, inputBuffer.trim());
          refreshProjects();
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
        const cleanName = inputBuffer.trim();
        if (cleanName) {
          const newProj = chatService.createProject(cleanName);
          refreshProjects();
          setMode("list");
          setInputBuffer("");
          // Automatically drill into the newly created project workspace
          setDrilledProjectId(newProj.id);
        } else {
          setMode("list");
          setInputBuffer("");
        }
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
    // CONFIRM DELETE MODE (Option A: delete chats vs Option B: keep standalone)
    // -------------------------------------------------------------------------
    if (mode === "confirm-delete") {
      const targetProj = projects[selectedIndex - 1];
      if (!targetProj) {
        setMode("list");
        return;
      }

      // 'd' confirms deleting project AND all child chats
      if (input === "d" || input === "D") {
        chatService.deleteProject(targetProj.id, "delete-chats");
        refreshProjects();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        setMode("list");
        return;
      }

      // 's' confirms deleting project container but keeping child chats as standalone
      if (input === "s" || input === "S") {
        chatService.deleteProject(targetProj.id, "keep-chats");
        refreshProjects();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
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
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) {
          setScrollOffset(next);
        }
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(totalItems - 1, prev + 1);
        if (next >= scrollOffset + maxVisible) {
          setScrollOffset(next - maxVisible + 1);
        }
        return next;
      });
      return;
    }

    // Enter key: drill down into project or create new project
    if (key.return) {
      if (selectedIndex === 0) {
        setMode("create");
        setInputBuffer("");
        return;
      }
      const targetProj = projects[selectedIndex - 1];
      if (targetProj) {
        setDrilledProjectId(targetProj.id);
      }
      return;
    }

    // Pin toggle
    if (input === "p" || input === "P") {
      if (selectedIndex > 0) {
        const targetProj = projects[selectedIndex - 1];
        if (targetProj) {
          chatService.togglePinProject(targetProj.id);
          refreshProjects();
        }
      }
      return;
    }

    // Rename
    if (input === "r" || input === "R") {
      if (selectedIndex > 0) {
        const targetProj = projects[selectedIndex - 1];
        if (targetProj) {
          setMode("rename");
          setInputBuffer(targetProj.name);
        }
      }
      return;
    }

    // Delete
    if (input === "d" || input === "D") {
      if (selectedIndex > 0) {
        setMode("confirm-delete");
      }
      return;
    }
  });

  // If currently drilled down into a project workspace, render the scoped ChatsView
  // Placed strictly AFTER all hooks to adhere to React Hook execution rules
  if (drilledProjectId) {
    const activeProject = projects.find((p) => p.id === drilledProjectId);
    return (
      <ChatsView
        projectId={drilledProjectId}
        projectName={activeProject?.name || "Project"}
        activeChatId={activeChatId}
        onSelectChat={onSelectChat}
        onBack={() => {
          setDrilledProjectId(null);
          refreshProjects();
        }}
        onClose={onClose}
        terminalSize={terminalSize}
      />
    );
  }

  const availableWidth = Math.max(30, terminalSize.columns - 4);
  const isNarrow3 = availableWidth < 70;
  const colChatsWidth = 18;
  const colDateWidth = 24;
  const colNameWidth3 = Math.max(16, availableWidth - colChatsWidth - colDateWidth - 4);

  return (
    <Box flexDirection="column" width={terminalSize.columns} paddingX={1}>
      {/* Top Banner with normal clean font */}
      <Box flexDirection="column" marginBottom={1} flexShrink={0}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="row" gap={2}>
            <Text bold color="cyan">
              Projects
            </Text>
            <Text color="gray">[Workspace Directory]</Text>
            <Text color="cyan" bold>
              ({projects.length} {projects.length === 1 ? "project" : "projects"})
            </Text>
          </Box>
          <Text color="gray">Esc: Close</Text>
        </Box>
        <Text color="cyan">{"━".repeat(Math.max(10, availableWidth))}</Text>
      </Box>

      {/* Main Content Area with side-by-side scrollbar (only when items exceed view) */}
      <Box flexDirection="row" width="100%" justifyContent="space-between" flexShrink={0}>
        {/* Left: 1-line compact cards list */}
        <Box flexDirection="column" flexGrow={1}>
          {Array.from({ length: visibleCount }).map((_, offset) => {
            const itemIdx = startIndex + offset;
            const isSelected = itemIdx === selectedIndex;

            // Option 0: + New project card (1 single line)
            if (itemIdx === 0) {
              if (isSelected && mode === "create") {
                return (
                  <Box key="new-project-create" height={1} flexDirection="row" flexShrink={0}>
                    <Text color="cyan" bold>
                      {">  "}
                    </Text>
                    <Text color="yellow" bold>
                      New project name:{" "}
                    </Text>
                    <Text color="white" bold>
                      {inputBuffer}
                    </Text>
                    <Text color="cyan">_</Text>
                    <Text color="gray">   (Enter to create, Esc to cancel)</Text>
                  </Box>
                );
              }

              return (
                <Box key="new-project-item" height={1} flexDirection="row" flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                    {isSelected ? ">  " : "   "}
                  </Text>
                  <Text color={isSelected ? "cyan" : "white"} bold>
                    + New project
                  </Text>
                  <Text color="gray">   •   Create a new isolated workspace container</Text>
                </Box>
              );
            }

            // Existing project item card
            const project = projects[itemIdx - 1];
            if (!project) return null;

            // Inline rename state
            if (isSelected && mode === "rename") {
              return (
                <Box key={project.id} height={1} flexDirection="row" flexShrink={0}>
                  <Text color="yellow" bold>
                    {">  "}
                  </Text>
                  <Text color="yellow" bold>
                    Rename:{" "}
                  </Text>
                  <Text color="white" bold>
                    {inputBuffer}
                  </Text>
                  <Text color="yellow">_</Text>
                  <Text color="gray">   (Enter to save, Esc to cancel)</Text>
                </Box>
              );
            }

            // Inline delete confirmation state (with delete vs keep option)
            if (isSelected && mode === "confirm-delete") {
              return (
                <Box key={project.id} minHeight={1} flexDirection="row" flexWrap="wrap" flexShrink={0}>
                  <Text color="red" bold>
                    {">   "}
                  </Text>
                  <Text color="red" bold>
                    Delete &quot;{project.name}&quot;?{" "}
                  </Text>
                </Box>
              );
            }

            const pinTag = project.pinned ? "[PIN] " : "";
            const dateStr = formatCompactDate(project.updatedAt);
            const chatCount = project.chatIds.length;

            if (!isNarrow3) {
              // 3 Columns: Name, Chats, Last Edited
              return (
                <Box key={project.id} height={1} flexDirection="row" width="100%" flexShrink={0}>
                  <Box width={colNameWidth3} flexShrink={0} flexDirection="row">
                    <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                      {isSelected ? ">  " : "   "}
                    </Text>
                    {pinTag ? (
                      <Text color="cyan" bold>
                        {pinTag}
                      </Text>
                    ) : null}
                    <Text color={isSelected ? "cyan" : "white"} bold wrap="truncate-end">
                      {project.name}
                    </Text>
                  </Box>
                  <Box width={colChatsWidth} flexShrink={0}>
                    <Text color="cyan">
                      [{chatCount} {chatCount === 1 ? "chat active" : "chats active"}]
                    </Text>
                  </Box>
                  <Box width={colDateWidth} flexShrink={0}>
                    <Text color="gray">Last edited: {dateStr}</Text>
                  </Box>
                </Box>
              );
            } else {
              // Narrow: Name on line 1, Chats + Date wrapped on line 2
              return (
                <Box key={project.id} flexDirection="column" width="100%" flexShrink={0}>
                  <Box flexDirection="row" width="100%">
                    <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                      {isSelected ? ">  " : "   "}
                    </Text>
                    {pinTag ? (
                      <Text color="cyan" bold>
                        {pinTag}
                      </Text>
                    ) : null}
                    <Text color={isSelected ? "cyan" : "white"} bold wrap="truncate-end">
                      {project.name}
                    </Text>
                  </Box>
                  <Box marginLeft={3} flexDirection="row" gap={3}>
                    <Text color="cyan">
                      [{chatCount} {chatCount === 1 ? "chat active" : "chats active"}]
                    </Text>
                    <Text color="gray">Last edited: {dateStr}</Text>
                  </Box>
                </Box>
              );
            }
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
                <Text color="white"> delete project & all chats</Text>
              </Box>
              <Box marginRight={2} flexShrink={0}>
                <Text color="cyan" bold>[ s ]</Text>
                <Text color="white"> delete project but save chats</Text>
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
                <Text color="white"> open workspace</Text>
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
                <Text color="white"> close</Text>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};
