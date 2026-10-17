// Status:: complete
// /queue — detailed queue inspector view.
// Strictly adheres to zero-emoji design, sequential pipeline visualizer, inspector section, responsive wrapping, and decoupled scrolling.

import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { SessionTask } from "../../../state/session.js";
import type { RoleDefinition } from "../../../roles/base.js";

export interface QueueViewProps {
  tasks: SessionTask[];
  activeTask?: SessionTask | null;
  isProcessing?: boolean;
  totalTokensUsed?: number;
  onClose: () => void;
  onClearQueue?: () => void;
  terminalSize: { columns: number; rows: number };
  getRoleColor?: (role: string) => string;
  roles?: RoleDefinition[];
}

interface InspectorRow {
  key: string;
  label: string;
  valueNode: React.ReactNode;
}

export const QueueView: React.FC<QueueViewProps> = ({
  tasks,
  activeTask,
  isProcessing = false,
  totalTokensUsed = 0,
  onClose,
  onClearQueue,
  terminalSize,
  getRoleColor,
  roles,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tasksScrollOffset, setTasksScrollOffset] = useState(0);
  const [inspectorScrollOffset, setInspectorScrollOffset] = useState(0);

  const availableWidth = Math.max(30, terminalSize.columns - 4);

  // Helper to resolve role color safely
  const resolveRoleColor = (role: string): string => {
    if (getRoleColor) return getRoleColor(role);
    const lower = role.toLowerCase();
    if (lower.includes("manager")) return "cyan";
    if (lower.includes("coder")) return "green";
    if (lower.includes("reviewer")) return "yellow";
    if (lower.includes("documenter")) return "magenta";
    if (lower.includes("security")) return "red";
    return "cyan";
  };

  // Helper to resolve role model configuration
  const resolveRoleModel = (role: string): { model: string; type: string } => {
    if (!roles) return { model: "llama3.1:8b", type: "local" };
    const found = roles.find(
      (r) =>
        r.name.toLowerCase() === role.toLowerCase() ||
        r.slug.toLowerCase() === role.toLowerCase().replace(/\s+/g, "-")
    );
    if (!found) return { model: "llama3.1:8b", type: "local" };
    return { model: found.model || "llama3.1:8b", type: found.assignmentType || "local" };
  };

  // Keep selection clamped within bounds
  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= tasks.length) {
      setSelectedIndex(tasks.length - 1);
    }
  }, [tasks.length, selectedIndex]);

  // Reset inspector scroll when inspecting a different task
  useEffect(() => {
    setInspectorScrollOffset(0);
  }, [selectedIndex]);

  // Selected task or fallback to activeTask or first task
  const selectedTask: SessionTask | null = useMemo(() => {
    if (tasks.length === 0) return null;
    return tasks[selectedIndex] || activeTask || tasks[0] || null;
  }, [tasks, selectedIndex, activeTask]);

  // Layout height calculations (strictly responsive to small terminal windows)
  const reservedHeights = 11;
  const availableContentHeight = Math.max(6, terminalSize.rows - reservedHeights);
  const maxTasksVisible = Math.max(2, Math.min(5, Math.floor(availableContentHeight * 0.45)));
  const totalTasks = tasks.length;
  const maxTasksScroll = Math.max(0, totalTasks - maxTasksVisible);

  // Auto-scroll task list when selection changes
  useEffect(() => {
    if (selectedIndex < tasksScrollOffset) {
      setTasksScrollOffset(selectedIndex);
    } else if (selectedIndex >= tasksScrollOffset + maxTasksVisible) {
      setTasksScrollOffset(selectedIndex - maxTasksVisible + 1);
    }
  }, [selectedIndex, tasksScrollOffset, maxTasksVisible]);

  // Clamp task list scroll offset
  useEffect(() => {
    if (tasksScrollOffset > maxTasksScroll) {
      setTasksScrollOffset(maxTasksScroll);
    }
  }, [maxTasksScroll, tasksScrollOffset]);

  const visibleTasks = tasks.slice(tasksScrollOffset, tasksScrollOffset + maxTasksVisible);

  // Pipeline chain construction: Manager -> Roles -> Documenter (always last & never wrapped)
  const pipelineRoles = useMemo(() => {
    if (tasks.length === 0) {
      return [
        { role: "Manager", status: "idle" },
        { role: "Coder", status: "standby" },
        { role: "Code Reviewer", status: "standby" },
        { role: "Documenter", status: "standby" },
      ];
    }

    const chain: { role: string; status: "done" | "active" | "pending" | "error" | "idle" | "standby" }[] = [
      { role: "Manager", status: "done" },
    ];

    for (const t of tasks) {
      let st: "done" | "active" | "pending" | "error" = "pending";
      if (t.status === "done") st = "done";
      else if (t.status === "running") st = "active";
      else if (t.status === "error") st = "error";
      chain.push({ role: t.role, status: st });
    }

    // Guarantee Documenter is present at the end
    const hasDoc = chain.some((item) => item.role.toLowerCase() === "documenter");
    if (!hasDoc) {
      chain.push({ role: "Documenter", status: "pending" });
    }

    return chain;
  }, [tasks]);

  // Build the inspector detail rows (each strictly on its own new line)
  const inspectorRows = useMemo<InspectorRow[]>(() => {
    if (!selectedTask) {
      return [
        {
          key: "idle-desc",
          label: "Status",
          valueNode: <Text color="gray" italic>Pipeline is currently idle. Sequential rules:</Text>,
        },
        {
          key: "idle-1",
          label: "Rule 1",
          valueNode: <Text color="gray">Sequential Execution: Only ONE role executes at a time.</Text>,
        },
        {
          key: "idle-2",
          label: "Rule 2",
          valueNode: <Text color="gray">Manager plans and decomposes tasks into structured stages.</Text>,
        },
        {
          key: "idle-3",
          label: "Rule 3",
          valueNode: <Text color="gray">Builders implement code strictly inside Layer 1 boundaries.</Text>,
        },
        {
          key: "idle-4",
          label: "Rule 4",
          valueNode: <Text color="gray">Checkers audit code and verify system security.</Text>,
        },
        {
          key: "idle-5",
          label: "Rule 5",
          valueNode: <Text color="gray">Documenter is strictly last, updating raw audit logs and memory.</Text>,
        },
      ];
    }

    const roleModel = resolveRoleModel(selectedTask.role);
    const roleColor = resolveRoleColor(selectedTask.role);

    let statusText = "[ ] Queued (Waiting for previous stage)";
    let statusColor = "gray";
    if (selectedTask.status === "running") {
      statusText = "[●] Still working...";
      statusColor = "yellow";
    } else if (selectedTask.status === "done") {
      statusText = `[✓] Completed successfully (${selectedTask.tokensUsed || 0} tokens)`;
      statusColor = "green";
    } else if (selectedTask.status === "error") {
      statusText = "[✗] Execution error";
      statusColor = "red";
    }

    const pathsText =
      selectedTask.filePaths && selectedTask.filePaths.length > 0
        ? selectedTask.filePaths.join(", ")
        : "(none specified)";

    const boundaryText =
      selectedTask.fileBoundaries && selectedTask.fileBoundaries.length > 0
        ? selectedTask.fileBoundaries.join(", ")
        : "source/";

    const rows: InspectorRow[] = [];

    // Line 1: Role
    rows.push({
      key: "row-role",
      label: "Role",
      valueNode: (
        <Text color={roleColor} bold>
          {selectedTask.role}
        </Text>
      ),
    });

    // Line 2: Assigned Model
    rows.push({
      key: "row-model",
      label: "Assigned Model",
      valueNode: (
        <Text color="yellow">
          {roleModel.model} [{roleModel.type}]
        </Text>
      ),
    });

    // Line 3: Execution Status
    rows.push({
      key: "row-status",
      label: "Status",
      valueNode: (
        <Text color={statusColor} bold>
          {statusText}
        </Text>
      ),
    });

    // Line 4: Target Paths
    rows.push({
      key: "row-paths",
      label: "Target Paths",
      valueNode: <Text color="white">{pathsText}</Text>,
    });

    // Line 5: Layer 1 Boundary
    rows.push({
      key: "row-boundary",
      label: "Layer 1 Boundary",
      valueNode: (
        <Text color="cyan">
          {boundaryText} [Strict Containment Enforced]
        </Text>
      ),
    });

    // Line 6: Prompt Instructions
    rows.push({
      key: "row-prompt",
      label: "Prompt",
      valueNode: (
        <Text color="white" wrap="wrap">
          {selectedTask.prompt}
        </Text>
      ),
    });

    // Line 7: Task Output Summary (if present)
    if (selectedTask.output) {
      rows.push({
        key: "row-output",
        label: "Output",
        valueNode: (
          <Text color="green" wrap="wrap">
            {selectedTask.output}
          </Text>
        ),
      });
    }

    return rows;
  }, [selectedTask, roles, getRoleColor]);

  // Inspector height & scrollbar calculations
  const totalInspectorRows = inspectorRows.length;
  const inspectorVisibleHeight = Math.max(3, availableContentHeight - maxTasksVisible);
  const maxInspectorScroll = Math.max(0, totalInspectorRows - inspectorVisibleHeight);

  // Clamp inspector scroll offset
  useEffect(() => {
    if (inspectorScrollOffset > maxInspectorScroll) {
      setInspectorScrollOffset(maxInspectorScroll);
    }
  }, [maxInspectorScroll, inspectorScrollOffset]);

  const visibleInspectorRows = inspectorRows.slice(
    inspectorScrollOffset,
    inspectorScrollOffset + inspectorVisibleHeight
  );

  // Task List Scrollbar Rail (renders IF AND ONLY IF tasks exceed maxTasksVisible)
  const tasksScrollbarRows = useMemo(() => {
    if (totalTasks <= maxTasksVisible) {
      return [];
    }
    const scrollbarHeight = maxTasksVisible;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxTasksVisible / totalTasks) * scrollbarHeight))
    );
    const scrollRatio = maxTasksScroll > 0 ? tasksScrollOffset / maxTasksScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const sb: { index: number; isThumb: boolean }[] = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      sb.push({ index: i, isThumb });
    }
    return sb;
  }, [totalTasks, maxTasksVisible, maxTasksScroll, tasksScrollOffset]);

  // Inspector Scrollbar Rail (renders IF AND ONLY IF inspector content exceeds container)
  const inspectorScrollbarRows = useMemo(() => {
    if (totalInspectorRows <= inspectorVisibleHeight) {
      return [];
    }
    const scrollbarHeight = inspectorVisibleHeight;
    const thumbHeight = Math.max(
      1,
      Math.min(
        scrollbarHeight - 1,
        Math.round((inspectorVisibleHeight / totalInspectorRows) * scrollbarHeight)
      )
    );
    const scrollRatio = maxInspectorScroll > 0 ? inspectorScrollOffset / maxInspectorScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const sb: { index: number; isThumb: boolean }[] = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      sb.push({ index: i, isThumb });
    }
    return sb;
  }, [totalInspectorRows, inspectorVisibleHeight, maxInspectorScroll, inspectorScrollOffset]);

  // Keyboard navigation: ONLY Esc closes the modal. Arrow keys, PgUp/PgDn, and Touchpad scroll.
  useInput((input, key) => {
    // Touchpad & mouse wheel scrolling: dynamically scrolls whichever container is overflowing
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
      if (inspectorScrollbarRows.length > 0) {
        setInspectorScrollOffset((prev) => Math.max(0, prev - 1));
      } else if (tasksScrollbarRows.length > 0) {
        setTasksScrollOffset((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (isWheelDown) {
      if (inspectorScrollbarRows.length > 0) {
        setInspectorScrollOffset((prev) => Math.min(maxInspectorScroll, prev + 1));
      } else if (tasksScrollbarRows.length > 0) {
        setTasksScrollOffset((prev) => Math.min(maxTasksScroll, prev + 1));
      }
      return;
    }

    // Ignore other SGR mouse sequences (clicks/drags)
    if (
      input.startsWith("\x1b[<") ||
      input.startsWith("[<") ||
      input === "[4" ||
      /^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input)
    ) {
      return;
    }

    // ONLY Esc closes the modal (Requirement 3: remove 'q' hotkey from closing)
    if (key.escape) {
      onClose();
      return;
    }

    // Clear finished queue tasks on 'c' or 'C'
    if ((input === "c" || input === "C") && onClearQueue && !isProcessing) {
      onClearQueue();
      return;
    }

    // Up/Down navigation between tasks or scrolling inspector
    if (key.upArrow) {
      if (tasks.length > 1) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else {
        setInspectorScrollOffset((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (key.downArrow) {
      if (tasks.length > 1) {
        setSelectedIndex((prev) => Math.min(tasks.length - 1, prev + 1));
      } else {
        setInspectorScrollOffset((prev) => Math.min(maxInspectorScroll, prev + 1));
      }
      return;
    }
  });

  return (
    <Box flexDirection="column" width={terminalSize.columns} paddingX={1}>
      {/* Top Banner with normal clean font */}
      <Box flexDirection="column" marginBottom={1} flexShrink={0}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="row" gap={2}>
            <Text bold color="cyan">
              Queue
            </Text>
            <Text color="gray">[Task Execution Pipeline]</Text>
            <Text color={isProcessing ? "yellow" : tasks.length > 0 ? "green" : "gray"} bold>
              {isProcessing
                ? `(Running • ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"})`
                : tasks.length > 0
                ? `(Complete • ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"})`
                : "(Idle • 0 tasks)"}
            </Text>
          </Box>
          <Text color="gray">Esc: Close</Text>
        </Box>
        <Text color="cyan">{"━".repeat(Math.max(10, availableWidth))}</Text>
      </Box>

      {/* Section 1: Pipeline Visualizer */}
      <Box flexDirection="column" marginBottom={1} flexShrink={0}>
        <Text bold color="white">
          Pipeline Execution Chain:
        </Text>
        <Box flexDirection="row" alignItems="center" marginTop={0} flexWrap="wrap">
          {pipelineRoles.map((item, idx) => {
            const isLast = idx === pipelineRoles.length - 1;
            const isDocumenter = item.role.toLowerCase() === "documenter";
            const roleColor = resolveRoleColor(item.role);

            let statusColor = "gray";
            if (item.status === "done") statusColor = "green";
            else if (item.status === "active") statusColor = "yellow";
            else if (item.status === "error") statusColor = "red";

            return (
              <Box
                key={`chain-${item.role}-${idx}`}
                flexDirection="row"
                alignItems="center"
                flexShrink={isDocumenter ? 0 : 1}
              >
                <Text color={roleColor} bold>
                  {item.role}
                </Text>
                <Text color={statusColor} bold={item.status === "active"}>
                  {" "}
                  ({item.status})
                </Text>
                {!isLast && <Text color="gray">{" -> "}</Text>}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Section 2: Tasks List with Optional Scrollbar Rail */}
      <Box flexDirection="column" marginBottom={1} flexShrink={0}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text bold color="white">
            Execution Queue ({tasks.length}):
          </Text>
          {totalTokensUsed > 0 && (
            <Text color="gray">
              Total tokens: <Text color="cyan" bold>{totalTokensUsed.toLocaleString()}</Text>
            </Text>
          )}
        </Box>

        {tasks.length === 0 ? (
          <Box marginLeft={2} marginTop={0}>
            <Text color="gray" italic>
              No tasks queued. Switch to BUILD mode and send a prompt to dispatch tasks.
            </Text>
          </Box>
        ) : (
          <Box flexDirection="row" width="100%" justifyContent="space-between" marginTop={0}>
            {/* Left: Task Rows */}
            <Box flexDirection="column" flexGrow={1}>
              {visibleTasks.map((t, idx) => {
                const actualIdx = tasksScrollOffset + idx;
                const isSelected = actualIdx === selectedIndex;
                const roleColor = resolveRoleColor(t.role);

                let badge = "[ ]";
                let badgeColor = "gray";
                if (t.status === "done") {
                  badge = "[✓]";
                  badgeColor = "green";
                } else if (t.status === "running") {
                  badge = "[●]";
                  badgeColor = "yellow";
                } else if (t.status === "error") {
                  badge = "[✗]";
                  badgeColor = "red";
                }

                return (
                  <Box key={t.taskId} height={1} flexDirection="row" width="100%" flexShrink={0}>
                    <Text color={isSelected ? "cyan" : "gray"} bold={isSelected}>
                      {isSelected ? ">  " : "   "}
                    </Text>
                    <Text color={badgeColor} bold>
                      {badge}{" "}
                    </Text>
                    <Box width={18} flexShrink={0}>
                      <Text color={roleColor} bold>
                        {t.role}
                      </Text>
                    </Box>
                    <Box width={10} flexShrink={0}>
                      <Text color="cyan">[Stage {t.stage}]</Text>
                    </Box>
                    <Box flexGrow={1} flexShrink={1}>
                      <Text color={isSelected ? "white" : "gray"} wrap="truncate-end">
                        {t.prompt}
                      </Text>
                    </Box>
                    {t.tokensUsed !== undefined && t.tokensUsed > 0 && (
                      <Box marginLeft={2} flexShrink={0}>
                        <Text color="gray">{t.tokensUsed} tokens</Text>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Right: Smooth Web Scrollbar Rail (ONLY appears if tasks exceed container) */}
            {tasksScrollbarRows.length > 0 && (
              <Box flexDirection="column" width={1} marginLeft={1} flexShrink={0}>
                {tasksScrollbarRows.map((r) => (
                  <Box key={`sb-task-${r.index}`} height={1}>
                    {r.isThumb ? <Text color="cyan" bold>█</Text> : <Text> </Text>}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Section 3: Task Inspector with Separate Lines and Optional Scrollbar Rail */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
        flexGrow={1}
      >
        <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
          <Text bold color="cyan">
            Task Inspector
          </Text>
          {selectedTask && (
            <Text color="gray">
              {selectedTask.taskId} • Stage {selectedTask.stage}
            </Text>
          )}
        </Box>

        <Box flexDirection="row" width="100%" justifyContent="space-between" flexGrow={1}>
          {/* Left: Inspector Detail Rows (every item strictly on its own new line) */}
          <Box flexDirection="column" flexGrow={1}>
            {visibleInspectorRows.map((r) => (
              <Box key={r.key} flexDirection="row" width="100%" flexShrink={0} marginTop={0}>
                <Text color="gray">{r.label}: </Text>
                {r.valueNode}
              </Box>
            ))}
          </Box>

          {/* Right: Smooth Web Scrollbar Rail (ONLY appears if inspector content exceeds container) */}
          {inspectorScrollbarRows.length > 0 && (
            <Box flexDirection="column" width={1} marginLeft={1} flexShrink={0}>
              {inspectorScrollbarRows.map((r) => (
                <Box key={`sb-insp-${r.index}`} height={1}>
                  {r.isThumb ? <Text color="cyan" bold>█</Text> : <Text> </Text>}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Elevated Footer Shortcut Bar (guaranteed visible and wraps on small terminals) */}
      <Box flexShrink={0} marginTop={1} flexDirection="column" width="100%">
        <Text color="gray">{"─".repeat(Math.max(10, availableWidth))}</Text>
        <Box flexDirection="row" flexWrap="wrap" marginTop={1} width="100%" flexShrink={0}>
          <Box marginRight={2} flexShrink={0}>
            <Text color="yellow" bold>[ Esc ]</Text>
            <Text color="white"> close modal</Text>
          </Box>
          {tasks.length > 1 && (
            <Box marginRight={2} flexShrink={0}>
              <Text color="cyan" bold>[ ↑/↓ ]</Text>
              <Text color="white"> select task</Text>
            </Box>
          )}
          {inspectorScrollbarRows.length > 0 && (
            <Box marginRight={2} flexShrink={0}>
              <Text color="cyan" bold>[ PgUp/PgDn / Wheel ]</Text>
              <Text color="white"> scroll details</Text>
            </Box>
          )}
          {tasks.length > 0 && onClearQueue && !isProcessing && (
            <Box marginRight={2} flexShrink={0}>
              <Text color="cyan" bold>[ c ]</Text>
              <Text color="white"> clear finished queue</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
