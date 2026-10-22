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
  tokenCaps?: {
    cap1: number;
    cap2: number;
    enabled: boolean;
  };
  tasks?: TaskItem[];
  height?: number;
  isProcessing?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mode = "IMPLEMENTATION",
  tokensUsed = 0,
  tokenCap1 = 10000,
  tokenCap2 = 100000,
  tokenCaps,
  tasks = [],
  height = 20,
  isProcessing = false,
}) => {
  const effectiveCap1 = tokenCaps?.cap1 ?? tokenCap1;
  const effectiveCap2 = tokenCaps?.cap2 ?? tokenCap2;
  const isCapsEnabled = tokenCaps ? tokenCaps.enabled : true;

  // x# and xx# appear UNDER the # of tokens (e.g. 230,000 -> x3 - 30,000 tokens & xx2 - 200,000 tokens)
  // x10 rolls over to xx1 (xCount is modulo 10); xx# scales indefinitely with no upper limit.
  const tierLabels: string[] = [];
  if (isCapsEnabled) {
    const xxCount = Math.floor(tokensUsed / effectiveCap2);
    const remainder = tokensUsed % effectiveCap2;
    const xCount = Math.floor(remainder / effectiveCap1);

    if (xCount > 0) {
      tierLabels.push(`x${xCount} - ${(xCount * effectiveCap1).toLocaleString()} tokens`);
    }
    if (xxCount > 0) {
      tierLabels.push(`xx${xxCount} - ${(xxCount * effectiveCap2).toLocaleString()} tokens`);
    }
  }

  return (
    <Box
      flexDirection="column"
      width={30}
      height={height}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
    >
      {/* Mode Indicator Widget at top of sidebar (Requirement 6) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row">
          <Text bold dimColor>
            MODE{" "}
          </Text>
          <Text dimColor>
            (Press Tab To Switch)
          </Text>
        </Box>
        <Text bold color={mode === "PLANNING" ? "cyan" : "green"}>
          [{mode === "PLANNING" ? "PLAN" : "BUILD"}]
        </Text>
      </Box>

      {/* Widget 1: Task Token Count (Numerical Tracking) */}
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold dimColor>
            TOKENS
          </Text>
          {isProcessing && (
            <Text bold color="cyan">
              [ACTIVE]
            </Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text bold>
            {tokensUsed.toLocaleString()}
          </Text>
          {tierLabels.map((lbl, idx) => (
            <Text key={idx} dimColor>
              {lbl}
            </Text>
          ))}
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
