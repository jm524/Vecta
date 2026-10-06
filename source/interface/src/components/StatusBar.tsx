// Status:: in-progress
// StatusBar sits at the very bottom of the screen.
// It shows what mode you are in and reminds you of quick keyboard shortcuts.
import React from "react";
import { Box, Text } from "ink";
import type { AppMode } from "../hooks/useModeTab.js";

interface StatusBarProps {
  // Current mode (PLANNING or IMPLEMENTATION)
  mode: AppMode;
  // Name of the active model driving the Manager
  modelName?: string;
  // Whether the right sidebar is currently visible
  sidebarOpen: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  modelName = "llama3.1:8b",
  sidebarOpen,
}) => {
  const isPlanning = mode === "PLANNING";

  return (
    // Outer container: full width row with a subtle top border
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      {/* Left side: Active Mode Pill & Model */}
      <Box flexDirection="row" gap={1}>
        <Text bold color={isPlanning ? "cyan" : "green"}>
          {isPlanning ? "● [PLANNING MODE]" : "● [IMPLEMENTATION MODE]"}
        </Text>
        <Text dimColor>│</Text>
        <Text color="yellow">Model: {modelName}</Text>
      </Box>

      {/* Right side: Keyboard Shortcut Hints */}
      <Box flexDirection="row" gap={1}>
        <Text dimColor>[Tab] Mode</Text>
        <Text dimColor>│</Text>
        <Text dimColor>{sidebarOpen ? "[Ctrl+←] Close Sidebar" : "[Ctrl+→] Open Sidebar"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor>[q] Queue</Text>
        <Text dimColor>│</Text>
        <Text dimColor>[/exit] Quit</Text>
      </Box>
    </Box>
  );
};
