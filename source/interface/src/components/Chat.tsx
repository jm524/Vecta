// Status:: in-progress
// Chat is the main conversation panel.
// It has a clean header with a small [PLAN] or [BUILD] badge, message scrolling, and a minimal input box.
import React, { useState } from "react";
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
  // Height available for the chat panel
  availableHeight?: number;
}

export const Chat: React.FC<ChatProps> = ({
  mode,
  messages,
  onSendMessage,
  autoAccept = false,
  availableHeight = 20,
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

  // Calculate visible message capacity based on available height
  // Reserve lines for: top header (2), input box (3)
  const maxVisibleLines = Math.max(4, availableHeight - 5);

  // Take the most recent messages that fit
  const visibleMessages = messages.slice(-maxVisibleLines);
  const hiddenCount = Math.max(0, messages.length - visibleMessages.length);

  return (
    // Outer chat box: full height container with clean rounded border
    <Box
      flexDirection="column"
      flexGrow={1}
      height={availableHeight}
      borderStyle="round"
      borderColor={modeColor}
      paddingX={1}
    >
      {/* Minimal Top Header: Just a small mode pill */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
        <Box flexDirection="row" gap={1}>
          <Text bold color={modeColor}>
            [{modeTag}]
          </Text>
          {hiddenCount > 0 && (
            <Text dimColor>↑ {hiddenCount} older messages</Text>
          )}
        </Box>
        <Text dimColor>{isPlanning ? "Tab to switch to Build" : "Tab to switch to Plan"}</Text>
      </Box>

      {/* Message Stream Area */}
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end" paddingY={0}>
        {messages.length === 0 ? (
          <Box flexDirection="column" paddingY={1}>
            <Text dimColor>Vecta ready. Type a prompt below...</Text>
          </Box>
        ) : (
          visibleMessages.map((msg) => {
            const isUser = msg.sender === "User";
            const senderColor = isUser ? "yellow" : msg.color || "cyan";

            return (
              <Box key={msg.id} flexDirection="column" marginBottom={0}>
                <Box flexDirection="row" gap={1}>
                  <Text bold color={senderColor}>
                    {msg.sender}:
                  </Text>
                  <Text>{msg.text}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Clean Bottom Input Box with Auto-Accept Tag on bottom right */}
      <Box flexDirection="column" marginTop={1}>
        <Box
          flexDirection="row"
          justifyContent="space-between"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          {/* Text Input without bulky prefixes */}
          <Box flexGrow={1}>
            <TextInput
              value={inputText}
              onChange={setInputText}
              onSubmit={handleSubmit}
              placeholder="Type a message or /exit..."
            />
          </Box>

          {/* Minimal Auto-Accept Badge on the bottom right */}
          <Box paddingLeft={1}>
            <Text dimColor>Auto-accept: </Text>
            <Text color={autoAccept ? "green" : "gray"}>
              {autoAccept ? "ON" : "OFF"}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
