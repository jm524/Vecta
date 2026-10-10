// Status:: in-progress
// Chat is the main conversation panel.
// Each message is rendered as a clean, stacked column with pre-wrapped lines and strict line budgeting to prevent text collisions.
import React, { useState, useMemo } from "react";
import { Box, Text } from "ink";
// @ts-ignore ink-text-input exports default
import TextInput from "ink-text-input";
import type { AppMode } from "../hooks/useModeTab.js";

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  color?: string;
  timestamp: string;
}

interface ChatProps {
  // Current active mode (PLANNING or IMPLEMENTATION)
  mode: AppMode;
  // History of messages
  messages: ChatMessage[];
  // Called when user submits text
  onSendMessage: (text: string) => void;
  // Whether auto-accept edits is ON or OFF
  autoAccept?: boolean;
  // Exact height available for the chat panel
  availableHeight?: number;
  // Exact width available for the chat panel
  availableWidth?: number;
  // Current scroll offset (0 = scrolled to bottom)
  scrollOffset: number;
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
  autoAccept = false,
  availableHeight = 24,
  availableWidth = 50,
  scrollOffset,
}) => {
  const [inputText, setInputText] = useState("");

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText("");
  };

  const isPlanning = mode === "PLANNING";
  const modeTag = isPlanning ? "PLAN" : "BUILD";
  const modeColor = isPlanning ? "cyan" : "green";

  // Height layout budgeting:
  // - Top Header: 2 lines
  // - Bottom Input Box: 3 lines
  // - Message Stream: remaining space
  const messageAreaHeight = Math.max(4, availableHeight - 6);
  // Inner text width accounting for borders, padding, and side scrollbar rail
  const innerWidth = Math.max(20, availableWidth - 8);

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
        // Role message: Header line with bold role tag and timestamp
        const roleColor = msg.color || "cyan";
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

  const olderAbove = visibleStart;
  const newerBelow = clampedOffset;

  // Visual scrollbar track and thumb calculation
  const totalLines = allLines.length;
  // Reserve 1 line of clearance so the thumb stops cleanly above the conversation bar
  const scrollbarHeight = Math.max(3, messageAreaHeight - 1);

  const scrollbarRows = useMemo(() => {
    if (totalLines <= messageAreaHeight) {
      return [];
    }

    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((scrollbarHeight / totalLines) * scrollbarHeight))
    );
    const maxScrollRange = totalLines - messageAreaHeight;
    const scrollRatio = maxScrollRange > 0 ? visibleStart / maxScrollRange : 0;
    const thumbTop = Math.min(
      scrollbarHeight - thumbHeight,
      Math.max(0, Math.round(scrollRatio * (scrollbarHeight - thumbHeight)))
    );

    const rows = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      let char = " ";

      if (isThumb) {
        if (thumbHeight === 1) {
          char = "┃";
        } else if (i === thumbTop) {
          char = "╻"; // Slightly rounded top edge
        } else if (i === thumbTop + thumbHeight - 1) {
          char = "╹"; // Slightly rounded bottom edge
        } else {
          char = "┃"; // Clean, smaller vertical bar
        }
      }

      rows.push({
        index: i,
        isThumb,
        char,
      });
    }
    return rows;
  }, [totalLines, messageAreaHeight, scrollbarHeight, visibleStart]);

  return (
    // Outer Chat Box: strictly anchored to availableHeight and availableWidth
    <Box
      flexDirection="column"
      width={availableWidth}
      height={availableHeight}
      borderStyle="round"
      borderColor={modeColor}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* 1. Top Header */}
      <Box flexDirection="row" justifyContent="space-between" height={1} marginBottom={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color={modeColor}>
            [{modeTag}]
          </Text>
          {olderAbove > 0 && <Text dimColor>↑ {olderAbove} older (PageUp / Ctrl+Up)</Text>}
          {newerBelow > 0 && <Text dimColor>↓ {newerBelow} newer (PageDown / Ctrl+Down)</Text>}
        </Box>
        <Text dimColor>{isPlanning ? "Tab: Switch to Build" : "Tab: Switch to Plan"}</Text>
      </Box>

      {/* 2. Middle Message Stream Area with Visual Scrollbar */}
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

        {/* Right: Sleek Floating Scrollbar Rail (no track lines, stays strictly above conversation bar) */}
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
                    {row.char}
                  </Text>
                ) : (
                  <Text> </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* 3. Bottom Input Box */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        height={3}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        {/* Clean text input */}
        <Box flexGrow={1}>
          <TextInput
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            placeholder="Type a message or /exit..."
          />
        </Box>

        {/* Minimal Auto-Accept Badge anchored to the right */}
        <Box paddingLeft={1}>
          <Text dimColor>Auto-accept: </Text>
          <Text color={autoAccept ? "green" : "gray"}>
            {autoAccept ? "ON" : "OFF"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
