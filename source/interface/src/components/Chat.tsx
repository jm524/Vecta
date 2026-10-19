// Status:: in-progress
// Chat is the main conversation panel.
// Each message is rendered as a clean, stacked column with pre-wrapped lines and strict line budgeting to prevent text collisions.
import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { AppMode } from "../hooks/useModeTab.js";
import type { RoleDefinition } from "../../../roles/base.js";
import { isShiftEnter } from "../helpers/keyboard.js";

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  color?: string;
  timestamp: string;
}

export interface SlashCommandItem {
  cmd: string;
  desc: string;
  hint?: string;
}

export const BASE_SLASH_COMMANDS: SlashCommandItem[] = [
  { cmd: "/roles", desc: "Manage worker roles, models, and autonomy" },
  {
    cmd: "/prompt",
    desc: "Select a role to edit its prompt",
    hint: "Shortcut: /prompt <role> or /<role> prompt (e.g. /prompt coder)",
  },
  { cmd: "/new", desc: "Start a fresh blank standalone chat" },
  { cmd: "/chats", desc: "List, create, rename, pin, or switch chats" },
  { cmd: "/projects", desc: "Manage project workspaces and scoped chats" },
  { cmd: "/queue", desc: "Inspect real-time task execution pipeline" },
  { cmd: "/memory", desc: "View and edit memory scopes, Key Points, and narratives" },
  { cmd: "/settings", desc: "Configure theme, timeouts, token caps, and safety limits" },
  { cmd: "/build", desc: "Switch to BUILD mode (code generation and execution)" },
  { cmd: "/plan", desc: "Switch to PLAN mode (architectural breakdown)" },
  { cmd: "/server stop", desc: "Stop background inference servers and free RAM" },
  { cmd: "/help", desc: "Show available commands" },
  { cmd: "/exit", desc: "Quit Vecta" },
];

export const SLASH_COMMANDS = BASE_SLASH_COMMANDS;

interface ChatProps {
  // Current active mode (PLANNING or IMPLEMENTATION)
  mode: AppMode;
  // History of messages
  messages: ChatMessage[];
  // Called when user submits text
  onSendMessage: (text: string) => void;
  // Optional helper to look up dynamic role colors
  getRoleColor?: (sender: string) => string;
  // Whether auto-accept edits is ON or OFF
  autoAccept?: boolean;
  // Exact height available for the chat panel
  availableHeight?: number;
  // Exact width available for the chat panel
  availableWidth?: number;
  // Current scroll offset (0 = scrolled to bottom)
  scrollOffset: number;
  // Available worker roles for dynamic autocomplete
  roles?: RoleDefinition[];
}

interface RenderedLine {
  id: string;
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

/**
 * Wraps a string into lines that strictly fit within maxLen characters.
 */
function wrapLine(text: string, maxLen: number): string[] {
  if (maxLen <= 10) return [text];
  if (!text) return [""];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      if (word.length > maxLen) {
        for (let i = 0; i < word.length; i += maxLen) {
          lines.push(word.slice(i, i + maxLen));
        }
      } else {
        current = word;
      }
    } else if (current.length + 1 + word.length <= maxLen) {
      current += " " + word;
    } else {
      lines.push(current);
      if (word.length > maxLen) {
        for (let i = 0; i < word.length; i += maxLen) {
          if (i + maxLen >= word.length) {
            current = word.slice(i);
          } else {
            lines.push(word.slice(i, i + maxLen));
          }
        }
      } else {
        current = word;
      }
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

export const Chat: React.FC<ChatProps> = ({
  mode,
  messages,
  onSendMessage,
  getRoleColor,
  autoAccept = false,
  availableHeight = 24,
  availableWidth = 50,
  scrollOffset,
  roles = [],
}) => {
  const [inputText, setInputText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [dropdownIndex, setDropdownIndex] = useState(0);

  // Synchronous refs to prevent stale closure when holding backspace/delete or typing rapidly
  const inputTextRef = React.useRef(inputText);
  inputTextRef.current = inputText;
  const cursorRef = React.useRef(cursor);
  cursorRef.current = cursor;

  const isSlashCommand = inputText.startsWith("/");

  // Autocomplete matching: matches base slash commands only without dynamic role indexing
  const filteredCommands = useMemo(() => {
    if (!isSlashCommand) return [];
    const search = inputText.toLowerCase().trim();
    if (search === "/") {
      return BASE_SLASH_COMMANDS;
    }
    const clean = search.startsWith("/") ? search.slice(1).trim() : search;

    return BASE_SLASH_COMMANDS.filter((c) => {
      const cmdNoSlash = c.cmd.slice(1).toLowerCase();
      const matchesCmd =
        c.cmd.toLowerCase().startsWith(search) ||
        cmdNoSlash.startsWith(clean) ||
        c.cmd.toLowerCase().includes(search);
      const matchesDesc = Boolean(c.desc && c.desc.toLowerCase().includes(clean));
      return matchesCmd || matchesDesc;
    });
  }, [isSlashCommand, inputText]);

  const maxVisibleDropdown = 7;
  const dropdownScroll = useMemo(() => {
    if (filteredCommands.length <= maxVisibleDropdown) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(
        dropdownIndex - Math.floor(maxVisibleDropdown / 2),
        filteredCommands.length - maxVisibleDropdown
      )
    );
  }, [dropdownIndex, filteredCommands.length]);

  const visibleCommands = useMemo(() => {
    if (filteredCommands.length <= maxVisibleDropdown) {
      return filteredCommands;
    }
    return filteredCommands.slice(dropdownScroll, dropdownScroll + maxVisibleDropdown);
  }, [filteredCommands, dropdownScroll]);

  const hasMoreAbove = dropdownScroll > 0;
  const hasMoreBelow = dropdownScroll + maxVisibleDropdown < filteredCommands.length;
  const numAbove = dropdownScroll;
  const numBelow = filteredCommands.length - (dropdownScroll + maxVisibleDropdown);

  // Split inputText into lines and track cursorLine & cursorCol for multi-line navigation
  const { inputLines, cursorLine, cursorCol } = useMemo(() => {
    const raw = inputText.split("\n");
    let cLine = 0;
    let cCol = 0;
    let offset = 0;
    for (let i = 0; i < raw.length; i++) {
      const len = raw[i]!.length;
      if (cursor >= offset && cursor <= offset + len) {
        cLine = i;
        cCol = cursor - offset;
        break;
      }
      offset += len + 1;
    }
    return { inputLines: raw, cursorLine: cLine, cursorCol: cCol };
  }, [inputText, cursor]);

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Check if this is a role prompt command shortcut (/prompt <role> or /<role> prompt)
    const isRolePromptCmd =
      trimmed.startsWith("/prompt ") ||
      (trimmed.startsWith("/") && /\s+prompt$/i.test(trimmed));

    // If typing partial base slash command (without spaces), autocomplete it
    if (
      isSlashCommand &&
      !isRolePromptCmd &&
      !trimmed.includes(" ") &&
      filteredCommands.length > 0 &&
      trimmed !== filteredCommands[dropdownIndex]?.cmd &&
      !BASE_SLASH_COMMANDS.some((c) => c.cmd === trimmed)
    ) {
      const selected = filteredCommands[dropdownIndex];
      if (selected) {
        setInputText(selected.cmd);
        setCursor(selected.cmd.length);
        return;
      }
    }

    onSendMessage(trimmed);
    inputTextRef.current = "";
    cursorRef.current = 0;
    setInputText("");
    setCursor(0);
  };

  // Keyboard navigation & typing handler
  useInput((input, key) => {
    // Ignore terminal mouse events (touchpad/mouse wheel, clicks) from changing options or typing garbage
    if (
      input.startsWith("\x1b[<") ||
      input.startsWith("[<") ||
      input.includes("<64;") ||
      input.includes("<65;") ||
      input === "[4" ||
      /^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input)
    ) {
      return;
    }

    const seq = (key as any)?.sequence || input || "";
    const code = (key as any)?.code || "";

    // 1. Universal keyboard shortcut: Shift + Enter = new line
    // Strictly ensures Ctrl+Enter does NOT insert newline or submit
    if (isShiftEnter(key, input)) {
      const cur = cursorRef.current;
      const text = inputTextRef.current;
      const newText = text.slice(0, cur) + "\n" + text.slice(cur);
      const newCursor = cur + 1;
      inputTextRef.current = newText;
      cursorRef.current = newCursor;
      setInputText(newText);
      setCursor(newCursor);
      return;
    }

    // 2. Regular Enter: Submit message or autocomplete (Ctrl+Enter strictly ignored)
    if (key.return && !key.ctrl && input !== "\n" && seq !== "\n") {
      handleSubmit(inputTextRef.current);
      return;
    }

    // 3. Slash Command dropdown navigation (Tab, Up/Down arrow when dropdown is active)
    // Up and Down arrow keys are the ONLY way to scroll through options (no touchpad scrolling)
    if (isSlashCommand && filteredCommands.length > 0) {
      if (key.tab) {
        const selected = filteredCommands[dropdownIndex];
        if (selected) {
          inputTextRef.current = selected.cmd;
          cursorRef.current = selected.cmd.length;
          setInputText(selected.cmd);
          setCursor(selected.cmd.length);
        }
        return;
      }
      if (key.upArrow) {
        setDropdownIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
        return;
      }
      if (key.downArrow) {
        setDropdownIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
        return;
      }
    }

    // 4. Up/Down Arrow for multi-line text input (ONLY for navigating lines, NEVER scrolling history)
    if (key.upArrow) {
      if (cursorLine > 0) {
        let prevOffset = 0;
        for (let i = 0; i < cursorLine - 1; i++) {
          prevOffset += inputLines[i]!.length + 1;
        }
        const prevLen = inputLines[cursorLine - 1]!.length;
        const targetCol = Math.min(cursorCol, prevLen);
        const newCursor = prevOffset + targetCol;
        cursorRef.current = newCursor;
        setCursor(newCursor);
      } else {
        cursorRef.current = 0;
        setCursor(0);
      }
      return;
    }

    if (key.downArrow) {
      if (cursorLine < inputLines.length - 1) {
        let nextOffset = 0;
        for (let i = 0; i <= cursorLine; i++) {
          nextOffset += inputLines[i]!.length + 1;
        }
        const nextLen = inputLines[cursorLine + 1]!.length;
        const targetCol = Math.min(cursorCol, nextLen);
        const newCursor = nextOffset + targetCol;
        cursorRef.current = newCursor;
        setCursor(newCursor);
      } else {
        const newCursor = inputTextRef.current.length;
        cursorRef.current = newCursor;
        setCursor(newCursor);
      }
      return;
    }

    // 5. Left/Right Arrow character navigation
    if (key.leftArrow) {
      const newCursor = Math.max(0, cursorRef.current - 1);
      cursorRef.current = newCursor;
      setCursor(newCursor);
      return;
    }
    if (key.rightArrow) {
      const newCursor = Math.min(inputTextRef.current.length, cursorRef.current + 1);
      cursorRef.current = newCursor;
      setCursor(newCursor);
      return;
    }

    // 6. Home / End keys: jump to line start or line end
    if (input === "\x1b[H" || input === "\x1b[1~") {
      let lineStartOffset = 0;
      for (let i = 0; i < cursorLine; i++) {
        lineStartOffset += inputLines[i]!.length + 1;
      }
      cursorRef.current = lineStartOffset;
      setCursor(lineStartOffset);
      return;
    }
    if (input === "\x1b[F" || input === "\x1b[4~") {
      let lineStartOffset = 0;
      for (let i = 0; i < cursorLine; i++) {
        lineStartOffset += inputLines[i]!.length + 1;
      }
      const newCursor = lineStartOffset + inputLines[cursorLine]!.length;
      cursorRef.current = newCursor;
      setCursor(newCursor);
      return;
    }

    // 7. Backspace / Delete: ALWAYS delete character before cursor (standard backspace across all platforms)
    // Synchronous ref updating enables continuous smooth deletion when holding the key
    const isBackspaceOrDelete = Boolean(
      key.backspace ||
      key.delete ||
      input === "\x08" ||
      input === "\x7f" ||
      input === "\b" ||
      input === "\x1b[3~" ||
      input === "\u001b[3~" ||
      input.includes("\x08") ||
      input.includes("\x7f") ||
      input.includes("\x1b[3~")
    );

    if (isBackspaceOrDelete) {
      const cur = cursorRef.current;
      const text = inputTextRef.current;
      const bsMatches = input.match(/[\x08\x7f\b]/g);
      const delMatches = input.match(/\x1b\[3~/g);
      const repeatCount = (bsMatches ? bsMatches.length : 0) + (delMatches ? delMatches.length : 0) || 1;
      const deleteCount = Math.min(cur, repeatCount);
      if (deleteCount > 0) {
        const newText = text.slice(0, cur - deleteCount) + text.slice(cur);
        const newCursor = cur - deleteCount;
        inputTextRef.current = newText;
        cursorRef.current = newCursor;
        setInputText(newText);
        setCursor(newCursor);
      }
      return;
    }

    // 9. Ctrl+K: clear prompt input buffer
    if (key.ctrl && (input === "k" || input === "K")) {
      inputTextRef.current = "";
      cursorRef.current = 0;
      setInputText("");
      setCursor(0);
      return;
    }

    // 10. Printable characters (inserted at cursor, updating refs immediately)
    if (
      input &&
      !key.ctrl &&
      !key.meta &&
      input !== "\r" &&
      input !== "\n" &&
      !input.startsWith("\x1b") &&
      !input.startsWith("[<") &&
      !/^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input) &&
      input !== "[4"
    ) {
      const cur = cursorRef.current;
      const text = inputTextRef.current;
      const newText = text.slice(0, cur) + input + text.slice(cur);
      const newCursor = cur + input.length;
      inputTextRef.current = newText;
      cursorRef.current = newCursor;
      setInputText(newText);
      setCursor(newCursor);
      return;
    }
  });

  const isPlanning = mode === "PLANNING";
  const modeTag = isPlanning ? "PLAN" : "BUILD";
  const modeColor = isPlanning ? "cyan" : "green";

  // Height layout budgeting:
  // - Dynamic Input Box: 1 (top line) + inputLines.length + 1 (bottom line)
  // - Dropdown: filteredCommands.length (if active)
  // - Message Stream: remaining available space (reactively shrinks when input expands)
  const inputBoxHeight = 2 + Math.max(1, inputLines.length);
  const dropdownHeight = isSlashCommand && visibleCommands.length > 0 ? (visibleCommands.length + 2) : 0;
  const messageAreaHeight = Math.max(3, availableHeight - inputBoxHeight - dropdownHeight);
  // Inner text width accounting for borders, padding, and side scrollbar rail
  const innerWidth = Math.max(20, availableWidth - 6);

  // Flatten all messages into fixed single-row renderable lines
  const allLines = useMemo(() => {
    const lines: RenderedLine[] = [];

    messages.forEach((msg, msgIdx) => {
      const isUser = msg.sender === "User";

      if (isUser) {
        // User message: yellow arrow + exact prompt text
        const wrapped = wrapLine(`› ${msg.text}`, innerWidth);
        wrapped.forEach((lineText, lineIdx) => {
          lines.push({
            id: `msg-${msg.id}-u-${lineIdx}`,
            text: lineText,
            color: "yellow",
          });
        });
      } else {
        // Role message: Header line with bold role tag and dynamic role color (Requirement 1)
        const roleColor = getRoleColor ? getRoleColor(msg.sender) : (msg.color || "cyan");
        lines.push({
          id: `msg-${msg.id}-h`,
          text: `[${msg.sender}] ${msg.timestamp}`,
          color: roleColor,
          bold: true,
        });

        // Body lines split by paragraph and wrapped to inner width
        const paragraphs = msg.text.split("\n");
        paragraphs.forEach((p, pIdx) => {
          const wrapped = wrapLine(p, innerWidth - 2);
          wrapped.forEach((lineText, lIdx) => {
            lines.push({
              id: `msg-${msg.id}-p-${pIdx}-${lIdx}`,
              text: `  ${lineText}`,
            });
          });
        });
      }

      // Add clean separation line between messages (except after last)
      if (msgIdx < messages.length - 1) {
        lines.push({
          id: `msg-${msg.id}-sep`,
          text: "",
        });
      }
    });

    return lines;
  }, [messages, innerWidth]);

  // Clamp scroll offset to total available lines
  const maxScroll = Math.max(0, allLines.length - messageAreaHeight);
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxScroll);

  const visibleEnd = allLines.length - clampedOffset;
  const visibleStart = Math.max(0, visibleEnd - messageAreaHeight);
  const visibleLines = allLines.slice(visibleStart, visibleEnd);

  // Smooth web-like scrollbar track and thumb calculation
  const totalLines = allLines.length;
  const scrollbarHeight = messageAreaHeight;

  const scrollbarRows = useMemo(() => {
    if (totalLines <= messageAreaHeight) {
      return [];
    }

    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((messageAreaHeight / totalLines) * scrollbarHeight))
    );
    const maxScrollRange = totalLines - messageAreaHeight;
    const scrollRatio = maxScrollRange > 0 ? visibleStart / maxScrollRange : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(
      maxThumbTop,
      Math.max(0, Math.round(scrollRatio * maxThumbTop))
    );

    const rows = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      rows.push({
        index: i,
        isThumb,
      });
    }
    return rows;
  }, [totalLines, messageAreaHeight, scrollbarHeight, visibleStart]);

  return (
    // Outer Chat Box: strictly anchored to availableHeight and availableWidth (borderless per Requirement 6)
    <Box
      flexDirection="column"
      width={availableWidth}
      height={availableHeight}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Message Stream Area with Visual Scrollbar */}
      <Box
        flexDirection="row"
        height={messageAreaHeight}
        justifyContent="space-between"
      >
        {/* Left: Message lines stack */}
        <Box
          flexDirection="column"
          flexGrow={1}
          height={messageAreaHeight}
          justifyContent="flex-end"
        >
          {allLines.length === 0 ? (
            <Box flexDirection="column" paddingY={1}>
              <Text dimColor>Vecta ready. Type a prompt below...</Text>
            </Box>
          ) : (
            visibleLines.map((line) => (
              <Box key={line.id} height={1}>
                <Text
                  color={line.color}
                  bold={line.bold}
                  dimColor={line.dim}
                  wrap="truncate"
                >
                  {line.text}
                </Text>
              </Box>
            ))
          )}
        </Box>

        {/* Right: Smooth web-like scrollbar rail (continuous │ rail with solid █ thumb) */}
        {scrollbarRows.length > 0 && (
          <Box
            flexDirection="column"
            width={1}
            height={messageAreaHeight}
            justifyContent="flex-start"
            paddingLeft={1}
          >
            {scrollbarRows.map((row) => (
              <Box key={row.index} height={1}>
                {row.isThumb ? (
                  <Text color={modeColor} bold>
                    █
                  </Text>
                ) : (
                  <Text> </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* 2. Reactive Expandable Input Container (One line above, dynamic lines in middle, one line below) */}
      <Box flexDirection="column" width={availableWidth - 2}>
        {/* Top single line */}
        <Box flexDirection="row">
          <Text color="gray">
            {"─".repeat(Math.max(10, availableWidth - 2))}
          </Text>
        </Box>

        {/* Dynamic multi-line text lines with inline character cursor */}
        <Box flexDirection="column">
          {inputText.length === 0 ? (
            <Box flexDirection="row">
              <Text color={modeColor} bold>{"> "}</Text>
              <Text color={modeColor} inverse>{" "}</Text>
              <Text color="gray"> Type a message or /roles... (Shift+Enter for new line)</Text>
            </Box>
          ) : (
            inputLines.map((lineText, idx) => {
              const isLineActive = idx === cursorLine;
              if (!isLineActive) {
                return (
                  <Box key={idx} flexDirection="row">
                    <Text color="gray">  </Text>
                    <Text>{lineText || " "}</Text>
                  </Box>
                );
              }
              const before = lineText.slice(0, cursorCol);
              const charAt = lineText[cursorCol] || " ";
              const after = lineText.slice(cursorCol + 1);

              return (
                <Box key={idx} flexDirection="row">
                  <Text color={modeColor} bold>{"> "}</Text>
                  <Text>{before}</Text>
                  <Text color={modeColor} inverse>{charAt}</Text>
                  <Text>{after}</Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Bottom single line below input */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">
            {"─".repeat(Math.max(10, availableWidth - 2))}
          </Text>
        </Box>
      </Box>

      {/* 3. Slash Command Autocomplete Dropdown (Rendered under chat box, borderless) */}
      {isSlashCommand && visibleCommands.length > 0 && (
        <Box
          flexDirection="column"
          paddingX={1}
          paddingY={0}
          marginTop={0}
          flexShrink={0}
        >
          <Box flexDirection="row" justifyContent="space-between" marginBottom={0} height={1} flexShrink={0}>
            <Box flexDirection="row" gap={1}>
              <Text bold color="cyan">
                Commands:
              </Text>
              {hasMoreAbove && (
                <Text color="yellow">▲ ({numAbove} more above)</Text>
              )}
              {hasMoreBelow && (
                <Text color="yellow">▼ ({numBelow} more below)</Text>
              )}
            </Box>
            <Text color="gray">Tab: complete   Up/Down: navigate   Enter: submit</Text>
          </Box>
          {visibleCommands.map((c) => {
            const isSelected = c.cmd === filteredCommands[dropdownIndex]?.cmd;
            return (
              <Box key={c.cmd} flexDirection="row" gap={2} height={1} flexShrink={0}>
                <Box width={24} flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                    {isSelected ? "> " : "  "}
                    {c.cmd}
                  </Text>
                </Box>
                <Text color={isSelected ? "white" : "gray"}>{c.desc}</Text>
              </Box>
            );
          })}
          {/* Dedicated 1-line hint slot so items never collapse or shift vertically */}
          <Box height={1} marginLeft={2} flexShrink={0}>
            {(() => {
              const activeCmd = filteredCommands[dropdownIndex];
              return activeCmd?.hint ? (
                <Text color="magenta">{"-> "} {activeCmd.hint}</Text>
              ) : null;
            })()}
          </Box>
        </Box>
      )}
    </Box>
  );
};
