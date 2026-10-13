// Status:: in-progress
// App is the full-screen terminal canvas.
// It integrates the Queue engine, Chat stream, live Sidebar, and Mode switcher.
import React, { useState, useEffect } from "react";
import { Box, useInput, useApp } from "ink";
import { Chat, type ChatMessage } from "./components/Chat.js";
import { Sidebar } from "./components/Sidebar.js";
import { useModeTab } from "./hooks/useModeTab.js";
import { useQueue } from "./hooks/useQueue.js";
import { engineBridge } from "./bridge/client.js";
import { useRoles } from "./hooks/useRoles.js";
import { AgentRoles } from "./commands/agent-roles.js";
import type { QueueDispatchPayload } from "./types/bridge.js";

export const App: React.FC = () => {
  const { exit } = useApp();
  // Manage mode (PLANNING = "PLAN" / IMPLEMENTATION = "BUILD")
  const { mode, setMode } = useModeTab("IMPLEMENTATION");

  // Hook for strictly sequential FIFO task execution
  const { tasks, totalTokensUsed, dispatchPipeline } = useQueue();

  // Track dynamic terminal window size so Vecta fills the entire screen
  const [terminalSize, setTerminalSize] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  // Track whether right sidebar is open (Ctrl+Left / Ctrl+Right)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-accept edits state (toggled via Shift+Tab or config)
  const [autoAccept, setAutoAccept] = useState(false);

  // Chat scroll offset (0 = scrolled all the way to newest messages)
  const [scrollOffset, setScrollOffset] = useState(0);

  // Active modal/screen overlay ("none" | "roles")
  const [activeOverlay, setActiveOverlay] = useState<"none" | "roles">("none");

  // Role system hook managing worker state, catalog, and recommendations
  const rolesHook = useRoles();

  // Conversation messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Listen for terminal resize events so Vecta always fills the whole window
  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, []);


  // Check Go engine connection on launch
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const res = await engineBridge.ping();
        if (res.success) {
          addMessage("Manager", `Vecta Engine online (v${res.data?.version || "0.0.4"}). Ready.`, "cyan");
        }
      } catch (err: any) {
        addMessage("System", `Engine bridge error: ${err.message}`, "red");
      }
    };
    checkBridge();
  }, []);

  // Global keyboard shortcuts (Sidebar, Auto-accept, and Scrolling)
  useInput((input, key) => {
    // Ctrl + Right Arrow opens sidebar
    if (key.ctrl && key.rightArrow) {
      setSidebarOpen(true);
      return;
    }
    // Ctrl + Left Arrow closes sidebar
    if (key.ctrl && key.leftArrow) {
      setSidebarOpen(false);
      return;
    }
    // Shift + Tab toggles Auto-accept
    if (key.shift && key.tab) {
      setAutoAccept((prev) => !prev);
      return;
    }

    // Scroll Up: Up Arrow (1 line), PageUp (3 lines), Ctrl+Up, Shift+Up
    if (key.upArrow || key.pageUp || (key.ctrl && key.upArrow) || (key.shift && key.upArrow)) {
      setScrollOffset((prev) => prev + (key.pageUp ? 3 : 1));
      return;
    }
    // Scroll Down: Down Arrow (1 line), PageDown (3 lines), Ctrl+Down, Shift+Down
    if (key.downArrow || key.pageDown || (key.ctrl && key.downArrow) || (key.shift && key.downArrow)) {
      setScrollOffset((prev) => Math.max(0, prev - (key.pageDown ? 3 : 1)));
      return;
    }
  });

  const addMessage = (sender: string, text: string, color?: string) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const resolvedColor =
      color || (sender === "User" ? "yellow" : sender === "System" ? "cyan" : rolesHook.getRoleColor(sender));
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        sender,
        text,
        color: resolvedColor,
        timestamp: time,
      },
    ]);
    // Reset scroll offset on new message so user sees newest activity
    setScrollOffset(0);
  };

  const handleUserPrompt = (promptText: string) => {
    const trimmed = promptText.trim();

    // Exit commands
    if (trimmed === "/exit" || trimmed === "/quit") {
      addMessage("System", "Exiting...", "yellow");
      setTimeout(() => {
        exit();
        engineBridge.stop();
        process.exit(0);
      }, 100);
      return;
    }

    // Agent roles screen command (/agent roles or /roles)
    if (trimmed === "/agent roles" || trimmed === "/roles") {
      setActiveOverlay("roles");
      return;
    }

    // Build mode command (Requirement 6)
    if (trimmed === "/build") {
      if (mode === "IMPLEMENTATION") {
        addMessage("System", "Already in BUILD mode.", "green");
      } else {
        setMode("IMPLEMENTATION");
        addMessage("System", "Switched to BUILD mode.", "green");
      }
      return;
    }

    // Plan mode command (Requirement 6)
    if (trimmed === "/plan") {
      if (mode === "PLANNING") {
        addMessage("System", "Already in PLAN mode.", "cyan");
      } else {
        setMode("PLANNING");
        addMessage("System", "Switched to PLAN mode.", "cyan");
      }
      return;
    }

    // Stop background inference servers command (Sprint Plan §2U & improvements #9)
    if (trimmed === "/server stop") {
      rolesHook.stopBackgroundServer().then((msg) => {
        addMessage("System", msg, "blue");
      });
      return;
    }

    // Help command (fixes BUG-012, Item 1 & Requirement 6)
    if (trimmed === "/help") {
      addMessage(
        "System",
        [
          "Vecta CLI Quick Cheatsheet & Command Index",
          "",
          "Commands:",
          "  /roles (or /agent roles) - Open interactive AI roles manager (models, colors, prompts, autonomy)",
          "  /build                   - Switch to BUILD mode (code generation and execution)",
          "  /plan                    - Switch to PLAN mode (architectural breakdown)",
          "  /server stop             - Stop running background model inference servers (Ollama, LM Studio)",
          "  /help                    - Display this command index and shortcut reference",
          "  /exit, /quit             - Cleanly close and exit Vecta",
          "",
          "Keyboard Shortcuts:",
          "  Tab            - Toggle mode between PLANNING (architecture) and BUILD (code generation)",
          "  Ctrl + Left    - Hide right-hand live inspector sidebar",
          "  Ctrl + Right   - Reveal right-hand live inspector sidebar",
          "  Shift + Tab    - Toggle 'Auto-accept edits' mode on/off",
          "  PageUp / Down  - Scroll up and down through conversation history",
          "  /              - Open floating slash command autocomplete dropdown below chat input",
          "",
          "Inside /roles:",
          "  Up / Down      - Navigate worker roster and action menus",
          "  Space          - Toggle worker role on or off (Orchestrators & Documenter stay on)",
          "  Enter          - Drill down into role settings or select action",
          "  Esc            - Go back one level or close the roles screen",
        ].join("\n"),
        "cyan"
      );
      return;
    }

    addMessage("User", promptText);

    if (mode === "PLANNING") {
      // Planning mode: Manager decomposes tasks conceptually
      setTimeout(() => {
        addMessage(
          "Manager",
          `[Plan] Deconstructing: "${promptText}". Mapping architecture boundaries and task dependencies.`,
          "cyan"
        );
      }, 150);
    } else {
      // Implementation mode: Manager matches roles and dispatches through the FIFO queue
      const lower = promptText.toLowerCase();
      const pipeline: QueueDispatchPayload[] = [];
      const runId = Date.now();

      // Helper to check if a role is currently enabled in rolesHook
      const isRoleEnabled = (slug: string): boolean => {
        const found = rolesHook.roles.find((r) => r.slug === slug);
        return found ? found.enabled : true;
      };

      // Keyword & path heuristics (Sprint Plan §2M) respecting enabled roles
      let builderRole = "Coder";
      let builderPaths = ["source/"];
      let checkerRole = "Code Reviewer";
      let checkerPrompt = "Inspect implementation correctness";

      if (lower.includes("auth") || lower.includes("api") || lower.includes("login") || lower.includes("database")) {
        builderRole = isRoleEnabled("backend-engineer") ? "Backend Engineer" : "Coder";
        builderPaths = ["source/engine/"];
        checkerRole = isRoleEnabled("security-checker")
          ? "Security Checker"
          : isRoleEnabled("code-reviewer")
          ? "Code Reviewer"
          : "Reviewer";
        checkerPrompt = "Verify authentication boundary and credential handling";
      } else if (
        lower.includes("ui") ||
        lower.includes("component") ||
        lower.includes("button") ||
        lower.includes("screen") ||
        lower.includes("frontend")
      ) {
        builderRole = isRoleEnabled("frontend-engineer") ? "Frontend Engineer" : "Coder";
        builderPaths = ["source/interface/src/components/"];
        checkerRole = isRoleEnabled("code-reviewer") ? "Code Reviewer" : "Reviewer";
        checkerPrompt = "Audit component types and layout ergonomics";
      } else {
        builderRole = isRoleEnabled("coder") ? "Coder" : "Backend Engineer";
        builderPaths = ["source/"];
        checkerRole = isRoleEnabled("code-reviewer") ? "Code Reviewer" : "Reviewer";
        checkerPrompt = "Inspect implementation correctness";
      }

      // Stage 1: Dispatched Builder
      pipeline.push({
        taskId: `task-${runId}-1`,
        role: builderRole,
        stage: 1,
        prompt: promptText,
        filePaths: builderPaths,
        fileBoundaries: ["source/"],
      });

      // Stage 2: Dispatched Checker (only if at least one checker is enabled)
      if (isRoleEnabled("code-reviewer") || isRoleEnabled("security-checker") || isRoleEnabled("reviewer")) {
        pipeline.push({
          taskId: `task-${runId}-2`,
          role: checkerRole,
          stage: 2,
          prompt: checkerPrompt,
          filePaths: builderPaths,
          fileBoundaries: ["source/"],
        });
      }

      // Stage 3: Documenter always runs last
      pipeline.push({
        taskId: `task-${runId}-3`,
        role: "Documenter",
        stage: 3,
        prompt: "Persist audit trail to raw.log and compact memory",
        filePaths: ["source/.vecta/"],
        fileBoundaries: ["source/"],
      });

      const sequence = pipeline.map((t, i) => `${i + 1}. ${t.role}`).join(" → ");
      addMessage("Manager", `Pipeline assembled: ${sequence}. Running sequentially...`, "cyan");

      // Dispatch through the sequential queue
      dispatchPipeline(
        pipeline,
        (taskResult) => {
          // As each task completes, announce it in chat with dynamic role color (Requirement 1)
          const roleColor = rolesHook.getRoleColor(taskResult.role);
          addMessage(taskResult.role, taskResult.output, roleColor);
        },
        () => {
          // When all tasks in the pipeline finish
          addMessage("Manager", "All pipeline tasks completed successfully.", rolesHook.getRoleColor("Manager"));
        }
      );
    }
  };

  const appHeight = Math.max(12, terminalSize.rows - 1);
  const sidebarWidth = 28;
  const chatWidth = sidebarOpen
    ? Math.max(30, terminalSize.columns - sidebarWidth - 1)
    : terminalSize.columns;

  // Map session tasks to sidebar format
  const sidebarTasks = tasks.map((t) => ({
    id: t.taskId,
    role: t.role,
    status: t.status,
    description: t.prompt,
  }));

  // If the agent roles screen is open, display it full width
  if (activeOverlay === "roles") {
    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <AgentRoles
          onClose={() => setActiveOverlay("none")}
          rolesHook={rolesHook}
          terminalSize={terminalSize}
        />
      </Box>
    );
  }

  return (
    // Fills entire terminal window dynamically
    <Box flexDirection="row" width={terminalSize.columns} height={appHeight} gap={1} padding={0}>
      {/* Main Chat Panel */}
      <Chat
        mode={mode}
        messages={messages}
        onSendMessage={handleUserPrompt}
        getRoleColor={rolesHook.getRoleColor}
        autoAccept={autoAccept}
        availableHeight={appHeight}
        availableWidth={chatWidth}
        scrollOffset={scrollOffset}
      />

      {/* Optional Right Sidebar */}
      {sidebarOpen && (
        <Sidebar
          mode={mode}
          tokensUsed={totalTokensUsed}
          tasks={sidebarTasks}
          height={appHeight}
        />
      )}
    </Box>
  );
};
