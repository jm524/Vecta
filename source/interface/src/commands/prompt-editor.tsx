// Status:: in-progress
// Prompt Editor: dedicated full-screen editor for Role Prompts.
// Features:
// 1. Clean slate — never dumps internal system limits or default boilerplate into user prompt.
// 2. Exact inline character cursor tracking (fixes BUG-016).
// 3. Shift+Enter inserts real newlines for multi-line prompts.
// 4. Delete key and Backspace support across all platforms.
// 5. Strict 300-word limit — auto-truncates to first 300 words on save or exit.
// 6. Auto-saves on exit (Esc).
// 7. Borderless, reactive, sleek Vecta terminal aesthetic.

import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { RoleDefinition } from "../../../roles/base.js";
import { isShiftEnter } from "../helpers/keyboard.js";

export interface PromptEditorProps {
  title: string;
  initialValue: string;
  onSave: (savedPrompt: string) => void;
  onClose: () => void;
  terminalSize: { columns: number; rows: number };
  roleColor?: string;
  roleSlug?: string;
}

/**
 * Counts words separated by any whitespace.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Truncates text to exactly 300 words if it exceeds the limit.
 */
export function truncateTo300Words(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 300) {
    return text;
  }
  let count = 0;
  let cutIndex = text.length;
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    count++;
    if (count === 300) {
      cutIndex = match.index + match[0].length;
      break;
    }
  }
  return text.slice(0, cutIndex).trim();
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  title,
  initialValue,
  onSave,
  onClose,
  terminalSize,
  roleColor = "cyan",
  roleSlug,
}) => {
  // Always start with clean user prompt — never default limits or system boilerplate
  const [buffer, setBuffer] = useState<string>(initialValue || "");
  const [cursor, setCursor] = useState<number>((initialValue || "").length);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Synchronous refs to prevent stale closure when holding backspace/delete
  const bufferRef = React.useRef(buffer);
  bufferRef.current = buffer;
  const cursorRef = React.useRef(cursor);
  cursorRef.current = cursor;

  const width = Math.max(50, terminalSize.columns);
  const height = Math.max(12, terminalSize.rows);
  const slug = (roleSlug || title).toLowerCase().replace(/ role$/i, "").trim();

  const words = useMemo(() => countWords(buffer), [buffer]);
  const isOverLimit = words > 300;
  const isNearLimit = words >= 280 && words <= 300;

  // Split buffer into lines for terminal rendering and locate cursor line & column
  const { lines, cursorLine, cursorCol } = useMemo(() => {
    const rawLines = buffer.split("\n");
    let cLine = 0;
    let cCol = 0;
    let charOffset = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const lineLen = rawLines[i]!.length;
      // Cursor is on this line if its index falls within line bounds or at the newline boundary
      if (cursor >= charOffset && cursor <= charOffset + lineLen) {
        cLine = i;
        cCol = cursor - charOffset;
        break;
      }
      charOffset += lineLen + 1; // +1 for the newline '\n'
    }

    return {
      lines: rawLines,
      cursorLine: cLine,
      cursorCol: cCol,
    };
  }, [buffer, cursor]);

  // Windowed vertical scrolling keeping active cursor line in view
  const maxVisibleLines = Math.max(4, height - 8);
  const scrollOffset = useMemo(() => {
    if (cursorLine < maxVisibleLines) {
      return 0;
    }
    return cursorLine - maxVisibleLines + 1;
  }, [cursorLine, maxVisibleLines]);

  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxVisibleLines);

  // Smooth web-like scrollbar track and thumb calculation for long prompts
  const scrollbarRows = useMemo(() => {
    if (lines.length <= maxVisibleLines) {
      return [];
    }
    const scrollbarHeight = maxVisibleLines;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxVisibleLines / lines.length) * scrollbarHeight))
    );
    const maxScroll = lines.length - maxVisibleLines;
    const scrollRatio = maxScroll > 0 ? scrollOffset / maxScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      rows.push({ index: i, isThumb });
    }
    return rows;
  }, [lines.length, maxVisibleLines, scrollOffset]);

  // Helper to save and close with 300-word auto-truncation
  const handleSaveAndClose = () => {
    const finalPrompt = truncateTo300Words(buffer);
    onSave(finalPrompt);
    onClose();
  };

  useInput((input, key) => {
    // 0. Mouse wheel scrolling for prompt text canvas ONLY
    if (input.startsWith("\x1b[<64;") || input.includes("<64;")) {
      if (cursorLine > 0) {
        let prevOffset = 0;
        for (let i = 0; i < cursorLine - 1; i++) {
          prevOffset += lines[i]!.length + 1;
        }
        const prevLen = lines[cursorLine - 1]!.length;
        setCursor(prevOffset + Math.min(cursorCol, prevLen));
      } else {
        setCursor(0);
      }
      return;
    }
    if (input.startsWith("\x1b[<65;") || input.includes("<65;")) {
      if (cursorLine < lines.length - 1) {
        let nextOffset = 0;
        for (let i = 0; i <= cursorLine; i++) {
          nextOffset += lines[i]!.length + 1;
        }
        const nextLen = lines[cursorLine + 1]!.length;
        setCursor(nextOffset + Math.min(cursorCol, nextLen));
      } else {
        setCursor(buffer.length);
      }
      return;
    }
    if (input.startsWith("\x1b[<")) {
      return;
    }

    // 1. Esc: Auto-saves up to 300 words and exits
    if (key.escape) {
      handleSaveAndClose();
      return;
    }

    // 2. Shift+Enter: Insert new line in multi-line prompt
    // (Esc is the sole exit & save mechanism; plain Enter does NOT create a newline)
    if (isShiftEnter(key, input)) {
      const cur = cursorRef.current;
      const text = bufferRef.current;
      const newText = text.slice(0, cur) + "\n" + text.slice(cur);
      const newCursor = cur + 1;
      bufferRef.current = newText;
      cursorRef.current = newCursor;
      setBuffer(newText);
      setCursor(newCursor);
      return;
    }

    // Ignore plain Enter in prompt editor
    if (key.return || input === "\r" || input === "\n") {
      return;
    }

    // 3. Ctrl+K: Clear prompt buffer
    if (key.ctrl && (input === "k" || input === "K")) {
      bufferRef.current = "";
      cursorRef.current = 0;
      setBuffer("");
      setCursor(0);
      setFeedback("Prompt cleared.");
      return;
    }

    // 4. Left Arrow: move cursor left
    if (key.leftArrow) {
      const newCursor = Math.max(0, cursorRef.current - 1);
      cursorRef.current = newCursor;
      setCursor(newCursor);
      return;
    }

    // 5. Right Arrow: move cursor right
    if (key.rightArrow) {
      const newCursor = Math.min(bufferRef.current.length, cursorRef.current + 1);
      cursorRef.current = newCursor;
      setCursor(newCursor);
      return;
    }

    // 6. Up Arrow: move cursor to previous line at same or nearest column (lines only, never history)
    if (key.upArrow) {
      if (cursorLine > 0) {
        let prevLineOffset = 0;
        for (let i = 0; i < cursorLine - 1; i++) {
          prevLineOffset += lines[i]!.length + 1;
        }
        const prevLineLen = lines[cursorLine - 1]!.length;
        const targetCol = Math.min(cursorCol, prevLineLen);
        const newCursor = prevLineOffset + targetCol;
        cursorRef.current = newCursor;
        setCursor(newCursor);
      } else {
        cursorRef.current = 0;
        setCursor(0);
      }
      return;
    }

    // 7. Down Arrow: move cursor to next line at same or nearest column (lines only, never history)
    if (key.downArrow) {
      if (cursorLine < lines.length - 1) {
        let nextLineOffset = 0;
        for (let i = 0; i <= cursorLine; i++) {
          nextLineOffset += lines[i]!.length + 1;
        }
        const nextLineLen = lines[cursorLine + 1]!.length;
        const targetCol = Math.min(cursorCol, nextLineLen);
        const newCursor = nextLineOffset + targetCol;
        cursorRef.current = newCursor;
        setCursor(newCursor);
      } else {
        const newCursor = bufferRef.current.length;
        cursorRef.current = newCursor;
        setCursor(newCursor);
      }
      return;
    }

    // 8. Backspace / Delete: ALWAYS deletes character before cursor (standard backspace across all platforms)
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
      const text = bufferRef.current;
      const bsMatches = input.match(/[\x08\x7f\b]/g);
      const delMatches = input.match(/\x1b\[3~/g);
      const repeatCount = (bsMatches ? bsMatches.length : 0) + (delMatches ? delMatches.length : 0) || 1;
      const deleteCount = Math.min(cur, repeatCount);
      if (deleteCount > 0) {
        const newText = text.slice(0, cur - deleteCount) + text.slice(cur);
        const newCursor = cur - deleteCount;
        bufferRef.current = newText;
        cursorRef.current = newCursor;
        setBuffer(newText);
        setCursor(newCursor);
      }
      return;
    }

    // 10. Printable characters
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
      const text = bufferRef.current;
      const newText = text.slice(0, cur) + input + text.slice(cur);
      const newCursor = cur + input.length;
      bufferRef.current = newText;
      cursorRef.current = newCursor;
      setBuffer(newText);
      setCursor(newCursor);
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      width={width}
      paddingX={1}
      paddingY={0}
    >
      {/* Sleek Borderless Header */}
      <Box flexDirection="row" justifyContent="space-between" flexShrink={0} marginBottom={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color={roleColor}>
            PROMPT: {title.toUpperCase()}
          </Text>
          <Text color="gray">│</Text>
          <Text color="gray">
            Words:{" "}
            <Text color={isOverLimit ? "red" : isNearLimit ? "yellow" : "green"} bold>
              {words} / 300
            </Text>
            {isOverLimit && <Text color="yellow"> (auto-cuts to 300 on exit)</Text>}
          </Text>
        </Box>
        <Text color="gray">Auto-save on exit [Esc]</Text>
      </Box>

      {/* Top single line above input */}
      <Box flexDirection="row" flexShrink={0}>
        <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
      </Box>

      {/* Clean Interactive Prompt Canvas - hugs text lines, dynamic height */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        height={Math.max(1, visibleLines.length)}
        flexShrink={0}
        paddingX={0}
        paddingY={0}
      >
        <Box flexDirection="column" flexGrow={1}>
          {buffer.length === 0 ? (
            <Box flexDirection="row">
              <Text color={roleColor}>█</Text>
              <Text color="gray"> (type prompt instructions here... Enter for new line)</Text>
            </Box>
          ) : (
            visibleLines.map((lineText, idx) => {
              const actualLineIdx = scrollOffset + idx;
              const isLineActive = actualLineIdx === cursorLine;

              if (!isLineActive) {
                return (
                  <Box key={idx} height={1} flexDirection="row">
                    <Text color="gray">  </Text>
                    <Text>{lineText || " "}</Text>
                  </Box>
                );
              }

              // Active line: splice the character cursor block '█' directly into the character position
              const before = lineText.slice(0, cursorCol);
              const charAt = lineText[cursorCol] || " ";
              const after = lineText.slice(cursorCol + 1);

              return (
                <Box key={idx} height={1} flexDirection="row">
                  <Text color={roleColor} bold>{"> "}</Text>
                  <Text>{before}</Text>
                  <Text color={roleColor} inverse>
                    {charAt}
                  </Text>
                  <Text>{after}</Text>
                </Box>
              );
            })
          )}
        </Box>

        {/* Right: Smooth web-like scrollbar rail for long prompts */}
        {scrollbarRows.length > 0 && (
          <Box flexDirection="column" width={1} height={Math.max(1, visibleLines.length)} paddingLeft={1} flexShrink={0}>
            {scrollbarRows.map((row) => (
              <Box key={row.index} height={1}>
                {row.isThumb ? (
                  <Text color={roleColor} bold>█</Text>
                ) : (
                  <Text> </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Bottom single line below input */}
      <Box flexDirection="row" flexShrink={0}>
        <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
      </Box>

      {/* Reactive Feedback Message */}
      <Box height={1} marginY={0} flexShrink={0}>
        {feedback ? (
          <Text color="yellow">{feedback}</Text>
        ) : isOverLimit ? (
          <Text color="red">Warning: 300-word limit exceeded. Excess words will be trimmed on save.</Text>
        ) : null}
      </Box>

      {/* Borderless Status Bar Footer */}
      <Box
        marginTop={0}
        paddingX={0}
        justifyContent="space-between"
        flexDirection="row"
        flexShrink={0}
      >
        <Text color="gray">
          Shift+Enter: new line   Ctrl+K: clear   Esc: exit (auto-saves)
        </Text>
        <Text color="magenta">
          Shortcut: /prompt {slug} or /{slug} prompt
        </Text>
      </Box>
    </Box>
  );
};

// -----------------------------------------------------------------------------
// PROMPT ROLE PICKER SCREEN (/prompt with no arguments)
// -----------------------------------------------------------------------------
export interface PromptRolePickerProps {
  roles: RoleDefinition[];
  terminalSize: { columns: number; rows: number };
  onSelectRole: (role: RoleDefinition) => void;
  onClose: () => void;
}

export const PromptRolePicker: React.FC<PromptRolePickerProps> = ({
  roles,
  terminalSize,
  onSelectRole,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const width = Math.max(50, terminalSize.columns);
  const height = Math.max(12, terminalSize.rows);

  useInput((input, key) => {
    // Terminal mouse events (touchpad/mouse wheel, clicks) - strictly ignored for role selection
    if (input.startsWith("\x1b[<") || input.includes("<64;") || input.includes("<65;")) {
      return;
    }

    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : roles.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < roles.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      const chosen = roles[selectedIndex];
      if (chosen) {
        onSelectRole(chosen);
      }
      return;
    }
  });

  // Each role card has 1 content line + 1 line of vertical margin spacing
  const rowHeight = 2;
  const maxVisible = Math.max(3, Math.floor((height - 8) / rowHeight));
  const scrollStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, roles.length - maxVisible))
  );
  const visibleRoles = roles.slice(scrollStart, scrollStart + maxVisible);

  // Smooth web scrollbar for role picker
  const scrollbarHeight = maxVisible * rowHeight;
  const scrollbarRows = useMemo(() => {
    if (roles.length <= maxVisible) {
      return [];
    }
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxVisible / roles.length) * scrollbarHeight))
    );
    const maxScroll = roles.length - maxVisible;
    const scrollRatio = maxScroll > 0 ? scrollStart / maxScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      rows.push({ index: i, isThumb });
    }
    return rows;
  }, [roles.length, maxVisible, scrollStart, scrollbarHeight]);

  return (
    <Box flexDirection="column" width={width} height={height} paddingX={1} paddingY={0}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1} flexShrink={0}>
        <Text bold color="cyan">
          SELECT ROLE TO EDIT PROMPT
        </Text>
        <Text color="gray">Esc: cancel</Text>
      </Box>

      <Box marginBottom={1} flexShrink={0}>
        <Text color="gray">
          Choose a role to customize its instructions (up to 300 words). Type <Text color="white">/prompt &lt;role&gt;</Text> or <Text color="white">/&lt;role&gt; prompt</Text> to jump straight to it.
        </Text>
      </Box>

      <Box flexDirection="row" flexGrow={1} justifyContent="space-between">
        <Box flexDirection="column" flexGrow={1}>
          {visibleRoles.map((role) => {
            const globalIdx = roles.findIndex((r) => r.slug === role.slug);
            const isSelected = globalIdx === selectedIndex;
            const words = countWords(role.prompt || "");
            const promptPreview = role.prompt
              ? `"${role.prompt.replace(/\s+/g, " ").trim().slice(0, 36)}${role.prompt.length > 36 ? "..." : ""}"`
              : "(No prompt set)";

            return (
              <Box
                key={role.slug}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                height={1}
                marginBottom={1}
                flexShrink={0}
              >
                {/* 1. Selector + Role Name in role color */}
                <Box width={22} flexDirection="row" flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "> " : "  "}
                  </Text>
                  <Text bold={isSelected} color={role.color as any}>
                    {role.name}
                  </Text>
                </Box>

                {/* 2. Role Function / Type badge */}
                <Box width={16} flexShrink={0}>
                  <Text color="gray">[{role.roleFunction}]</Text>
                </Box>

                {/* 3. Centered prompt snippet with clear space between type and words */}
                <Box flexGrow={1} justifyContent="center" paddingX={2} flexShrink={1}>
                  <Text
                    color={role.prompt ? (isSelected ? "white" : "gray") : "gray"}
                    italic={!role.prompt}
                    wrap="truncate"
                  >
                    {promptPreview}
                  </Text>
                </Box>

                {/* 4. Word count badge anchored to the right */}
                <Box width={16} justifyContent="flex-end" flexShrink={0}>
                  <Text color={words > 0 ? "green" : "gray"}>
                    {words > 0 ? `${words}/300 words` : "(empty)"}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Right: Smooth web-like scrollbar rail */}
        {scrollbarRows.length > 0 && (
          <Box flexDirection="column" width={1} height={scrollbarHeight} paddingLeft={1} flexShrink={0}>
            {scrollbarRows.map((row) => (
              <Box key={row.index} height={1}>
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

      {/* Status Bar Footer with Navigation and Shortcut Hints */}
      <Box marginTop={1} justifyContent="space-between" flexShrink={0}>
        <Text color="gray">
          Up/Down: select   Enter: edit prompt   Esc: back to chat
        </Text>
        <Text color="magenta">
          Shortcut: /prompt &lt;role&gt; or /&lt;role&gt; prompt
        </Text>
      </Box>
    </Box>
  );
};
