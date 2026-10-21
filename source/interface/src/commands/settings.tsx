// Status:: done
// /settings — Global application settings screen for Vecta CLI.
// Manages configuration in .vecta/config.json: themes, timeouts, raw log caps,
// auto-delete intervals, token usage caps, and Layer 2 workflow safety toggles.
// Strictly adheres to Sprint Plan §2H, §2I, §5 and Claude Docs 05, 06, 14, 17.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import {
  readConfig,
  writeConfig,
  type VectaConfig,
} from "../../../state/config.js";

export interface SettingsViewProps {
  onClose: () => void;
  onNavigateToRoles?: () => void;
  onNavigateToMemory?: () => void;
  terminalSize: { columns: number; rows: number };
}

type SettingKey =
  | "theme"
  | "username"
  | "rawLogCap"
  | "autoDelete"
  | "roleTimeout"
  | "tokenCaps"
  | "tokenCapsEnabled"
  | "confirmFileWrites"
  | "rolesTalkDirectly"
  | "showRoleThinking"
  | "navRoles"
  | "navMemory";

interface SettingItem {
  id: SettingKey;
  label: string;
  category: "General" | "Limits & Storage" | "Layer 2 Safety" | "Shortcuts";
  valueDescription: string;
}

const THEME_OPTIONS = ["default", "cyan", "royal", "amber", "emerald", "matrix"];
const RAW_LOG_CAP_OPTIONS = [64, 128, 256, 512, 1024]; // MB (1024 MB converts to 1 GB)
const AUTO_DELETE_OPTIONS = [1, 2, 4, 52 / 12, 52, 0]; // 1w, 2w, 4w, 1 month, 1 year, Disabled
const ROLE_TIMEOUT_OPTIONS = [300, 600, 900, 1800]; // Seconds (5m, 10m, 15m, 30m)

/**
 * Formats raw log size with unit conversion (e.g., 1024 MB -> 1 GB).
 */
export function formatRawLogCapDisplay(capMB: number): string {
  if (capMB >= 1024 && capMB % 1024 === 0) {
    return `${capMB / 1024} GB (Ring buffer)`;
  }
  if (capMB < 1 && capMB > 0) {
    return `${Math.round(capMB * 1024)} KB (Ring buffer)`;
  }
  return `${capMB} MB (Ring buffer)`;
}

/**
 * Formats inactivity auto-delete interval with day/week/month/year conversion.
 */
export function formatAutoDeleteDisplay(weeks: number): string {
  if (weeks <= 0) return "Disabled (Never auto-delete)";

  // Check 1 year (52 weeks)
  if (Math.abs(weeks - 52) < 0.5) {
    return "1 year inactivity";
  }

  // Check months (1 month = ~4.333 weeks = 52/12 weeks)
  const monthsExact = (weeks * 12) / 52;
  const roundedMonths = Math.round(monthsExact);
  if (roundedMonths >= 1 && Math.abs(monthsExact - roundedMonths) < 0.08) {
    return `${roundedMonths} ${roundedMonths === 1 ? "month" : "months"} inactivity`;
  }

  // Check integer weeks
  if (weeks >= 1 && Math.abs(weeks - Math.round(weeks)) < 0.01) {
    const w = Math.round(weeks);
    return `${w} ${w === 1 ? "week" : "weeks"} inactivity`;
  }

  // Days
  const days = Math.round(weeks * 7);
  if (days >= 1) {
    return `${days} ${days === 1 ? "day" : "days"} inactivity`;
  }

  return `${weeks} weeks inactivity`;
}

/**
 * Formats task timeout in seconds, minutes, or hours.
 */
export function formatTimeoutDisplay(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

interface CustomNumberState {
  targetId: "rawLogCap" | "autoDelete" | "roleTimeout";
  title: string;
  buffer: string;
  cursorPos: number;
  unitIndex: number;
  units: string[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onClose,
  onNavigateToRoles,
  onNavigateToMemory,
  terminalSize,
}) => {
  const [config, setConfig] = useState<VectaConfig>(() => readConfig());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Inline text editing mode (for username)
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameBuffer, setUsernameBuffer] = useState("");
  const [cursorPos, setCursorPos] = useState(0);

  // Custom number input mode (for log cap, timeout, inactivity)
  const [customNumber, setCustomNumber] = useState<CustomNumberState | null>(null);

  // Tab-scoped feedback banner
  const [feedback, setFeedback] = useState<{ message: string; color: string } | null>(null);

  const showFeedback = useCallback((message: string, color: string = "green") => {
    setFeedback({ message, color });
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  // Sync state to disk helper
  const updateConfig = useCallback((patch: Partial<VectaConfig>, feedbackMsg?: string) => {
    const updated = writeConfig(patch);
    setConfig(updated);
    if (feedbackMsg) {
      showFeedback(feedbackMsg);
    }
  }, [showFeedback]);

  // Formatted list of all settings items
  const items: SettingItem[] = useMemo(() => {
    const tokenCapDesc = config.tokenCaps.enabled
      ? `Active (Cap 1: ${config.tokenCaps.cap1.toLocaleString()}, Cap 2: ${config.tokenCaps.cap2.toLocaleString()})`
      : "Disabled (Show raw numbers)";

    return [
      {
        id: "theme",
        label: "Visual Theme",
        category: "General",
        valueDescription: config.theme,
      },
      {
        id: "username",
        label: "User Display Name",
        category: "General",
        valueDescription: config.username || "Developer",
      },
      {
        id: "rawLogCap",
        label: "Raw Audit Log Cap",
        category: "Limits & Storage",
        valueDescription: formatRawLogCapDisplay(config.rawLogCapMB),
      },
      {
        id: "autoDelete",
        label: "Inactivity Auto-Delete",
        category: "Limits & Storage",
        valueDescription: formatAutoDeleteDisplay(config.autoDeleteWeeks),
      },
      {
        id: "roleTimeout",
        label: "Agent Task Timeout",
        category: "Limits & Storage",
        valueDescription: formatTimeoutDisplay(config.timeouts.roleTimeoutSeconds),
      },
      {
        id: "tokenCaps",
        label: "Token Warning Caps",
        category: "Limits & Storage",
        valueDescription: tokenCapDesc,
      },
      {
        id: "confirmFileWrites",
        label: "Require Confirmation for File Writes",
        category: "Layer 2 Safety",
        valueDescription: config.layer2.confirmFileWrites ? "ON (Always prompt)" : "OFF (Auto-write)",
      },
      {
        id: "rolesTalkDirectly",
        label: "Roles Talk to User Directly",
        category: "Layer 2 Safety",
        valueDescription: config.layer2.rolesTalkDirectly ? "ON (Direct speech)" : "OFF (Manager relay only)",
      },
      {
        id: "showRoleThinking",
        label: "Show Role Reasoning Stream",
        category: "Layer 2 Safety",
        valueDescription: config.layer2.showRoleThinking ? "ON (Collapsible)" : "OFF (Status only)",
      },
      {
        id: "navRoles",
        label: "Open /agent roles",
        category: "Shortcuts",
        valueDescription: "Jump to AI Worker Roster",
      },
      {
        id: "navMemory",
        label: "Open /memory",
        category: "Shortcuts",
        valueDescription: "Jump to Memory Scopes & Key Points",
      },
    ];
  }, [config]);

  // Viewport calculation for windowed scrolling
  const reservedRows = 8;
  const maxVisible = Math.max(4, terminalSize.rows - reservedRows);
  const maxScroll = Math.max(0, items.length - maxVisible);

  // Clamp selection index
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(items.length - 1);
    }
  }, [selectedIndex, items.length]);

  // Conditional scrollbar rail: appears IF AND ONLY IF items exceed viewport
  const scrollbarRows = useMemo(() => {
    if (items.length <= maxVisible) return [];
    const scrollbarHeight = maxVisible;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxVisible / items.length) * scrollbarHeight))
    );
    const scrollRatio = maxScroll > 0 ? scrollOffset / maxScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows: { index: number; isThumb: boolean }[] = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      rows.push({ index: i, isThumb: i >= thumbTop && i < thumbTop + thumbHeight });
    }
    return rows;
  }, [items.length, maxVisible, maxScroll, scrollOffset]);

  // Keyboard navigation & toggle handler
  useInput((input, key) => {
    // -------------------------------------------------------------------------
    // 1. CUSTOM NUMERICAL VALUE INPUT MODE (Log cap, Timeout, Inactivity)
    // -------------------------------------------------------------------------
    if (customNumber) {
      if (key.escape) {
        setCustomNumber(null);
        return;
      }

      // Tab cycles through supported units
      if (key.tab) {
        setCustomNumber((prev) => {
          if (!prev) return null;
          const nextIdx = (prev.unitIndex + 1) % prev.units.length;
          const nextUnit = prev.units[nextIdx];
          let nextBuffer = prev.buffer;
          if (prev.targetId === "autoDelete" && nextUnit === "year") {
            nextBuffer = "1";
          }
          return {
            ...prev,
            unitIndex: nextIdx,
            buffer: nextBuffer,
            cursorPos: nextBuffer.length,
          };
        });
        return;
      }

      // Enter saves the parsed value converted to internal units
      if (key.return) {
        const val = parseFloat(customNumber.buffer);
        if (!isNaN(val) && val >= 0) {
          const selectedUnit = customNumber.units[customNumber.unitIndex]!;
          if (customNumber.targetId === "rawLogCap") {
            let capMB = val;
            if (selectedUnit === "KB") capMB = val / 1024;
            else if (selectedUnit === "GB") capMB = val * 1024;
            updateConfig(
              { rawLogCapMB: capMB },
              `Raw log cap set to ${formatRawLogCapDisplay(capMB)}.`
            );
          } else if (customNumber.targetId === "autoDelete") {
            let weeks = val;
            if (selectedUnit === "days") weeks = val / 7;
            else if (selectedUnit === "months") weeks = (val * 52) / 12;
            else if (selectedUnit === "year") weeks = 52;
            updateConfig(
              { autoDeleteWeeks: weeks },
              `Auto-delete set to ${formatAutoDeleteDisplay(weeks)}.`
            );
          } else if (customNumber.targetId === "roleTimeout") {
            let secs = Math.round(val);
            if (selectedUnit === "minutes") secs = Math.round(val * 60);
            else if (selectedUnit === "hours") secs = Math.round(val * 3600);
            updateConfig(
              {
                timeouts: {
                  roleTimeoutSeconds: secs,
                  warningThresholdSeconds: Math.round(secs / 2),
                },
              },
              `Task timeout set to ${formatTimeoutDisplay(secs)}.`
            );
          }
        }
        setCustomNumber(null);
        return;
      }

      if (key.backspace || key.delete) {
        setCustomNumber((prev) => {
          if (!prev || prev.cursorPos <= 0) return prev;
          const nextBuf =
            prev.buffer.slice(0, prev.cursorPos - 1) + prev.buffer.slice(prev.cursorPos);
          return {
            ...prev,
            buffer: nextBuf,
            cursorPos: prev.cursorPos - 1,
          };
        });
        return;
      }

      if (key.leftArrow) {
        setCustomNumber((prev) =>
          prev ? { ...prev, cursorPos: Math.max(0, prev.cursorPos - 1) } : null
        );
        return;
      }
      if (key.rightArrow) {
        setCustomNumber((prev) =>
          prev
            ? { ...prev, cursorPos: Math.min(prev.buffer.length, prev.cursorPos + 1) }
            : null
        );
        return;
      }

      // Allow typing digits and single decimal dot
      if (input && /[0-9.]/.test(input)) {
        setCustomNumber((prev) => {
          if (!prev) return null;
          // Year is strictly fixed to "1 year"
          if (prev.targetId === "autoDelete" && prev.units[prev.unitIndex] === "year") {
            return prev;
          }
          if (input === "." && prev.buffer.includes(".")) return prev;
          const nextBuf =
            prev.buffer.slice(0, prev.cursorPos) + input + prev.buffer.slice(prev.cursorPos);
          return {
            ...prev,
            buffer: nextBuf,
            cursorPos: prev.cursorPos + input.length,
          };
        });
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 2. USERNAME INLINE EDITING MODE
    // -------------------------------------------------------------------------
    if (editingUsername) {
      if (key.escape) {
        setEditingUsername(false);
        return;
      }
      if (key.return) {
        const clean = usernameBuffer.trim() || "Developer";
        updateConfig({ username: clean }, `Updated user name to "${clean}".`);
        setEditingUsername(false);
        return;
      }
      if (key.backspace || key.delete) {
        if (cursorPos > 0) {
          const next = usernameBuffer.slice(0, cursorPos - 1) + usernameBuffer.slice(cursorPos);
          setUsernameBuffer(next);
          setCursorPos((prev) => prev - 1);
        }
        return;
      }
      if (key.leftArrow) {
        setCursorPos((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.rightArrow) {
        setCursorPos((prev) => Math.min(usernameBuffer.length, prev + 1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        const next = usernameBuffer.slice(0, cursorPos) + input + usernameBuffer.slice(cursorPos);
        setUsernameBuffer(next);
        setCursorPos((prev) => prev + input.length);
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 3. SETTINGS LIST NAVIGATION
    // -------------------------------------------------------------------------
    // Touchpad and mouse wheel scrolling
    if (key.pageUp || input.startsWith("\x1b[<64;") || input.includes("<64;")) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.pageDown || input.startsWith("\x1b[<65;") || input.includes("<65;")) {
      setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
      return;
    }

    // Arrow navigation
    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(items.length - 1, prev + 1);
        if (next >= scrollOffset + maxVisible) {
          setScrollOffset(next - maxVisible + 1);
        }
        return next;
      });
      return;
    }

    // 'c' key shortcut: Opens custom amount prompt for numerical settings
    if (input === "c" || input === "C") {
      const active = items[selectedIndex];
      if (!active) return;
      if (active.id === "rawLogCap") {
        const isGB = config.rawLogCapMB >= 1024 && config.rawLogCapMB % 1024 === 0;
        const initialNum = isGB ? String(config.rawLogCapMB / 1024) : String(config.rawLogCapMB);
        const initialUnit = isGB ? 2 : 1; // 0=KB, 1=MB, 2=GB
        setCustomNumber({
          targetId: "rawLogCap",
          title: "Custom Raw Audit Log Cap",
          buffer: initialNum,
          cursorPos: initialNum.length,
          unitIndex: initialUnit,
          units: ["KB", "MB", "GB"],
        });
        return;
      }
      if (active.id === "autoDelete") {
        let initialUnit = 1; // 0=days, 1=weeks, 2=months, 3=year
        let initialNum = String(config.autoDeleteWeeks);

        if (Math.abs(config.autoDeleteWeeks - 52) < 0.5) {
          initialUnit = 3;
          initialNum = "1";
        } else {
          const monthsExact = (config.autoDeleteWeeks * 12) / 52;
          const roundedMonths = Math.round(monthsExact);
          if (roundedMonths >= 1 && Math.abs(monthsExact - roundedMonths) < 0.08) {
            initialUnit = 2;
            initialNum = String(roundedMonths);
          } else if (config.autoDeleteWeeks > 0 && config.autoDeleteWeeks < 1) {
            initialUnit = 0;
            initialNum = String(Math.round(config.autoDeleteWeeks * 7));
          } else {
            initialUnit = 1;
            initialNum = String(config.autoDeleteWeeks);
          }
        }

        setCustomNumber({
          targetId: "autoDelete",
          title: "Custom Inactivity Auto-Delete",
          buffer: initialNum,
          cursorPos: initialNum.length,
          unitIndex: initialUnit,
          units: ["days", "weeks", "months", "year"],
        });
        return;
      }
      if (active.id === "roleTimeout") {
        const isHours =
          config.timeouts.roleTimeoutSeconds >= 3600 &&
          config.timeouts.roleTimeoutSeconds % 3600 === 0;
        const isMins = config.timeouts.roleTimeoutSeconds % 60 === 0;
        let initialNum = "";
        let initialUnit = 1; // 0=seconds, 1=minutes, 2=hours
        if (isHours) {
          initialNum = String(config.timeouts.roleTimeoutSeconds / 3600);
          initialUnit = 2;
        } else if (isMins) {
          initialNum = String(config.timeouts.roleTimeoutSeconds / 60);
          initialUnit = 1;
        } else {
          initialNum = String(config.timeouts.roleTimeoutSeconds);
          initialUnit = 0;
        }
        setCustomNumber({
          targetId: "roleTimeout",
          title: "Custom Agent Task Timeout",
          buffer: initialNum,
          cursorPos: initialNum.length,
          unitIndex: initialUnit,
          units: ["seconds", "minutes", "hours"],
        });
        return;
      }
    }

    // Enter or Space toggles or cycles current option
    if (key.return || input === " ") {
      const active = items[selectedIndex];
      if (!active) return;

      switch (active.id) {
        case "theme": {
          const currentIdx = THEME_OPTIONS.indexOf(config.theme);
          const nextTheme = THEME_OPTIONS[(currentIdx + 1) % THEME_OPTIONS.length]!;
          updateConfig({ theme: nextTheme }, `Theme switched to "${nextTheme}".`);
          break;
        }
        case "username": {
          setUsernameBuffer(config.username);
          setCursorPos(config.username.length);
          setEditingUsername(true);
          break;
        }
        case "rawLogCap": {
          const curIdx = RAW_LOG_CAP_OPTIONS.indexOf(config.rawLogCapMB);
          const nextCap = RAW_LOG_CAP_OPTIONS[(curIdx + 1) % RAW_LOG_CAP_OPTIONS.length]!;
          updateConfig(
            { rawLogCapMB: nextCap },
            `Raw log cap set to ${formatRawLogCapDisplay(nextCap)}.`
          );
          break;
        }
        case "autoDelete": {
          const curIdx = AUTO_DELETE_OPTIONS.indexOf(config.autoDeleteWeeks);
          const nextWeeks = AUTO_DELETE_OPTIONS[(curIdx + 1) % AUTO_DELETE_OPTIONS.length]!;
          updateConfig(
            { autoDeleteWeeks: nextWeeks },
            nextWeeks === 0
              ? "Inactivity auto-delete disabled."
              : `Auto-delete set to ${formatAutoDeleteDisplay(nextWeeks)}.`
          );
          break;
        }
        case "roleTimeout": {
          const curIdx = ROLE_TIMEOUT_OPTIONS.indexOf(config.timeouts.roleTimeoutSeconds);
          const nextTimeout = ROLE_TIMEOUT_OPTIONS[(curIdx + 1) % ROLE_TIMEOUT_OPTIONS.length]!;
          updateConfig(
            {
              timeouts: {
                roleTimeoutSeconds: nextTimeout,
                warningThresholdSeconds: Math.round(nextTimeout / 2),
              },
            },
            `Task timeout set to ${formatTimeoutDisplay(nextTimeout)}.`
          );
          break;
        }
        case "tokenCaps": {
          const nextState = !config.tokenCaps.enabled;
          updateConfig(
            {
              tokenCaps: {
                ...config.tokenCaps,
                enabled: nextState,
              },
            },
            nextState ? "Token warning caps enabled (x notation)." : "Token caps disabled (raw numbers)."
          );
          break;
        }
        case "confirmFileWrites": {
          const nextVal = !config.layer2.confirmFileWrites;
          updateConfig(
            {
              layer2: {
                ...config.layer2,
                confirmFileWrites: nextVal,
              },
            },
            nextVal ? "Confirmation before file write: ON" : "Confirmation before file write: OFF"
          );
          break;
        }
        case "rolesTalkDirectly": {
          const nextVal = !config.layer2.rolesTalkDirectly;
          updateConfig(
            {
              layer2: {
                ...config.layer2,
                rolesTalkDirectly: nextVal,
              },
            },
            nextVal ? "Roles talk directly: ON" : "Roles talk directly: OFF (Manager relay)"
          );
          break;
        }
        case "showRoleThinking": {
          const nextVal = !config.layer2.showRoleThinking;
          updateConfig(
            {
              layer2: {
                ...config.layer2,
                showRoleThinking: nextVal,
              },
            },
            nextVal ? "Role reasoning: ON" : "Role reasoning: OFF"
          );
          break;
        }
        case "navRoles": {
          if (onNavigateToRoles) {
            onNavigateToRoles();
          }
          break;
        }
        case "navMemory": {
          if (onNavigateToMemory) {
            onNavigateToMemory();
          }
          break;
        }
      }
      return;
    }

    // Authoritative modal dismissal: Esc closes /settings overlay
    if (key.escape) {
      onClose();
      return;
    }
  });

  // ===========================================================================
  // RENDER: CUSTOM NUMERICAL VALUE INPUT MODAL
  // ===========================================================================
  if (customNumber) {
    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        paddingX={1}
        paddingY={0}
      >
        <Box marginBottom={1} flexShrink={0}>
          <Text bold color="cyan">
            {customNumber.title}
          </Text>
          <Text dimColor> — Enter a custom amount and select unit</Text>
        </Box>

        {/* Top Horizontal Line */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        </Box>

        <Box flexDirection="column" paddingY={0} paddingX={1} flexShrink={0}>
          <Box flexDirection="row" marginBottom={1}>
            <Text bold color="white">Value: </Text>
            <Text color="cyan" bold>
              {customNumber.buffer.slice(0, customNumber.cursorPos)}
              <Text inverse color="white">
                {customNumber.buffer.charAt(customNumber.cursorPos) || " "}
              </Text>
              {customNumber.buffer.slice(customNumber.cursorPos + 1)}
            </Text>
          </Box>

          <Box flexDirection="row" alignItems="center">
            <Text bold color="white">Unit:  </Text>
            {customNumber.units.map((u, idx) => {
              const isActive = idx === customNumber.unitIndex;
              return (
                <Box key={u} marginRight={2}>
                  <Text
                    bold={isActive}
                    color={isActive ? "cyan" : "gray"}
                    inverse={isActive}
                  >
                    {" "}{u}{" "}
                  </Text>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Bottom Horizontal Line */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        </Box>

        <Box flexShrink={0} marginTop={1}>
          <Text dimColor>Type number   Tab: cycle unit   Enter: save   Esc: cancel</Text>
        </Box>
      </Box>
    );
  }

  // ===========================================================================
  // RENDER: USERNAME INLINE EDITING MODAL
  // ===========================================================================
  if (editingUsername) {
    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        paddingX={1}
        paddingY={0}
      >
        <Box marginBottom={1} flexShrink={0}>
          <Text bold color="cyan">
            Edit User Display Name
          </Text>
          <Text dimColor> — Name used by AI agents to address you</Text>
        </Box>

        {/* Top Horizontal Line */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        </Box>

        <Box
          flexDirection="row"
          paddingY={0}
          paddingX={1}
          marginBottom={0}
          flexShrink={0}
        >
          <Text>
            {usernameBuffer.slice(0, cursorPos)}
            <Text inverse color="white">
              {usernameBuffer.charAt(cursorPos) || " "}
            </Text>
            {usernameBuffer.slice(cursorPos + 1)}
          </Text>
        </Box>

        {/* Bottom Horizontal Line */}
        <Box flexDirection="row" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, terminalSize.columns - 4))}</Text>
        </Box>

        <Box flexShrink={0} marginTop={1}>
          <Text dimColor>Enter: save   Esc: cancel</Text>
        </Box>
      </Box>
    );
  }

  // ===========================================================================
  // RENDER: SETTINGS LIST VIEW
  // ===========================================================================
  const visibleItems = items.slice(scrollOffset, scrollOffset + maxVisible);
  const activeSelected = items[selectedIndex];
  const isNumerical =
    activeSelected &&
    (activeSelected.id === "rawLogCap" ||
      activeSelected.id === "autoDelete" ||
      activeSelected.id === "roleTimeout");

  return (
    <Box
      flexDirection="column"
      width={terminalSize.columns}
      height={terminalSize.rows - 1}
      paddingX={1}
    >
      {/* Header */}
      <Box marginBottom={1} flexShrink={0}>
        <Text bold color="cyan">
          Settings
        </Text>
        <Text dimColor> — Application configuration, storage limits, and Layer 2 safety</Text>
      </Box>

      {/* Tab-scoped feedback slot */}
      <Box height={1} marginY={0} flexShrink={0}>
        {feedback && <Text color={feedback.color}>{feedback.message}</Text>}
      </Box>

      {/* Table Column Headers */}
      <Box flexDirection="row" marginBottom={0} flexShrink={0}>
        <Box width={3} flexShrink={0}>
          <Text dimColor> </Text>
        </Box>
        <Box width={40} flexShrink={0}>
          <Text bold dimColor>
            Setting
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold dimColor>
            Current Configuration
          </Text>
        </Box>
      </Box>

      {/* Settings Rows */}
      <Box flexDirection="row" flexGrow={1} marginY={0}>
        <Box flexDirection="column" flexGrow={1}>
          {visibleItems.map((item, visibleIdx) => {
            const actualIdx = scrollOffset + visibleIdx;
            const isSelected = actualIdx === selectedIndex;
            const isShortcut = item.category === "Shortcuts";

            return (
              <Box key={item.id} flexDirection="row" flexShrink={0} marginY={0}>
                <Box width={3} flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "›" : " "}
                  </Text>
                </Box>
                <Box width={40} flexShrink={0}>
                  <Text
                    bold={isSelected}
                    color={isSelected ? "cyan" : isShortcut ? "yellow" : "white"}
                  >
                    {item.label}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text
                    bold={isSelected}
                    color={isSelected ? "white" : isShortcut ? "cyan" : "gray"}
                  >
                    {item.valueDescription}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Scrollbar rail: renders IF AND ONLY IF items exceed viewport */}
        {scrollbarRows.length > 0 && (
          <Box flexDirection="column" width={1} flexShrink={0}>
            {scrollbarRows.map((row) => (
              <Text key={row.index} color={row.isThumb ? "cyan" : "gray"}>
                {row.isThumb ? "█" : "│"}
              </Text>
            ))}
          </Box>
        )}
      </Box>

      {/* Shortcut Footer */}
      <Box flexShrink={0} flexWrap="wrap">
        <Text dimColor>
          Up/Down: navigate   Enter/Space: toggle or edit{isNumerical ? "   c: custom value" : ""}   Esc: close
        </Text>
      </Box>
    </Box>
  );
};
