// Status:: in-progress
// Sidebar sits on the right side of the screen.
// Shows token count and current pipeline tasks, matching dynamic terminal height.
import React from "react";
import { Box, Text } from "ink";
import type { AppMode } from "../hooks/useModeTab.js";

export interface TaskItem {
  id: string;
  role: string;
  status: "pending" | "running" | "done" | "error";
  description: string;
}

interface SidebarProps {
  mode?: AppMode;
  tokensUsed?: number;
  tokenCap1?: number;
  tokenCap2?: number;
  tasks?: TaskItem[];
  height?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mode = "IMPLEMENTATION",
  tokensUsed = 0,
  tokenCap1 = 10000,
  tokenCap2 = 100000,
  tasks = [],
  height = 20,
}) => {
  const isWarning = tokensUsed >= tokenCap1;
  const isOverLimit = tokensUsed >= tokenCap2;
  const tokenColor = isOverLimit ? "red" : isWarning ? "yellow" : "green";

  return (
    <Box
      flexDirection="column"
      width={28}
      height={height}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
    >
      {/* Mode Indicator Widget at top of sidebar (Requirement 6) */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>
          MODE
        </Text>
        <Text bold color={mode === "PLANNING" ? "cyan" : "green"}>
          [{mode === "PLANNING" ? "PLAN" : "BUILD"}]
        </Text>
      </Box>

      {/* Widget 1: Task Token Count */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>
          TOKENS
        </Text>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={tokenColor}>
            {tokensUsed.toLocaleString()}
          </Text>
          <Text dimColor>/{tokenCap1.toLocaleString()}</Text>
        </Box>
      </Box>

      {/* Widget 2: Tasks List */}
      <Box flexDirection="column" flexGrow={1}>
        <Text bold dimColor>
          TASKS
        </Text>

        {tasks.length === 0 ? (
          <Text dimColor>Idle</Text>
        ) : (
          tasks.map((task) => {
            let statusIcon = "○";
            let statusColor = "gray";

            if (task.status === "running") {
              statusIcon = "●";
              statusColor = "yellow";
            } else if (task.status === "done") {
              statusIcon = "✓";
              statusColor = "green";
            } else if (task.status === "error") {
              statusIcon = "✗";
              statusColor = "red";
            }

            return (
              <Box key={task.id} flexDirection="row" gap={1}>
                <Text color={statusColor}>{statusIcon}</Text>
                <Text>{task.role}</Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};
