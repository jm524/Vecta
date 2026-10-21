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
import { PromptEditor, PromptRolePicker, countWords } from "./commands/prompt-editor.js";
import { ChatsView } from "./commands/chats.js";
import { ProjectsView } from "./commands/projects.js";
import { QueueView } from "./commands/queue.js";
import { MemoryView } from "./commands/memory.js";
import { SettingsView } from "./commands/settings.js";
import { useSession } from "./hooks/useSession.js";
import type { QueueDispatchPayload } from "./types/bridge.js";
import { pruneInactiveRawLogs } from "../../roles/documenter.js";

export const App: React.FC = () => {
  const { exit } = useApp();
  // Manage mode (PLANNING = "PLAN" / IMPLEMENTATION = "BUILD")
  const { mode, setMode } = useModeTab("IMPLEMENTATION");

  // Hook for strictly sequential FIFO task execution
  const { tasks, totalTokensUsed, dispatchPipeline, clearQueue, isProcessing, activeTask } = useQueue();

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

  // Active modal/screen overlay ("none" | "roles" | "prompt" | "chats" | "projects" | "queue" | "memory" | "settings")
  const [activeOverlay, setActiveOverlay] = useState<
    "none" | "roles" | "prompt" | "chats" | "projects" | "queue" | "memory" | "settings"
  >("none");
  const [promptTarget, setPromptTarget] = useState<
    | { type: "picker" }
    | { type: "role"; roleSlug: string; roleName: string; roleColor: string }
    | null
  >(null);

  // Role system hook managing worker state, catalog, and recommendations
  const rolesHook = useRoles();

  // Persistent session management (chats and projects)
  const session = useSession(rolesHook.getRoleColor);

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
        await engineBridge.ping();
        await engineBridge.cryptoInit();
        // Inactivity auto-delete runner (Claude Doc 14 & Sprint Plan §2I)
        pruneInactiveRawLogs().catch(() => {});
      } catch (err: any) {
        addMessage("System", `Engine bridge error: ${err.message}`, "red");
      }
    };
    checkBridge();
  }, []);

  // Global keyboard shortcuts (Sidebar, Auto-accept, and PageUp/PageDown Scrolling)
  useInput((input, key) => {
    // If an overlay screen is open, yield all inputs to the overlay
    if (activeOverlay !== "none") {
      return;
    }

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
    // Ctrl + Q opens queue inspector
    if (key.ctrl && (input === "q" || input === "Q")) {
      setActiveOverlay("queue");
      return;
    }

    // Scroll chat history ONLY with PageUp, PageDown, and terminal mouse wheel
    // Up and Down arrow keys are strictly reserved for menu options and line navigation
    if (key.pageUp || input.startsWith("\x1b[<64;") || input.includes("<64;")) {
      setScrollOffset((prev) => prev + 2);
      return;
    }
    if (key.pageDown || input.startsWith("\x1b[<65;") || input.includes("<65;")) {
      setScrollOffset((prev) => Math.max(0, prev - 2));
      return;
    }
  });

  const addMessage = (sender: string, text: string, color?: string) => {
    session.addMessage(sender, text, color);
    // Reset scroll offset on new message so user sees newest activity
    setScrollOffset(0);
  };

  const handleUserPrompt = (promptText: string) => {
    const trimmed = promptText.trim();

    // Exit command
    if (trimmed === "/exit") {
      addMessage("System", "Exiting...", "yellow");
      setTimeout(() => {
        exit();
        engineBridge.stop();
        process.exit(0);
      }, 100);
      return;
    }

    // Role prompt picker (/prompt)
    if (trimmed === "/prompt") {
      setPromptTarget({ type: "picker" });
      setActiveOverlay("prompt");
      return;
    }

    // Role prompt command (/prompt <role>)
    if (trimmed.startsWith("/prompt ")) {
      const identifier = trimmed.slice(8).trim().toLowerCase();
      const found = rolesHook.roles.find((r) => {
        const rSlug = r.slug.toLowerCase();
        const rName = r.name.toLowerCase();
        const rNameClean = rName.replace(/[\r\n\s]+/g, " ");
        const rNameHyphen = rName.replace(/[\r\n\s]+/g, "-");
        return (
          rSlug === identifier ||
          rName === identifier ||
          rNameClean === identifier ||
          rNameHyphen === identifier ||
          rSlug === identifier.replace(/\s+/g, "-") ||
          rSlug.replace(/-/g, " ") === identifier
        );
      });
      if (found) {
        setPromptTarget({
          type: "role",
          roleSlug: found.slug,
          roleName: found.name,
          roleColor: found.color,
        });
        setActiveOverlay("prompt");
      } else {
        addMessage(
          "System",
          `Role "${identifier}" not found. Available roles: ${rolesHook.roles.map((r) => r.name).join(", ")}`,
          "yellow"
        );
      }
      return;
    }

    // Direct role prompt command (/<role> prompt, e.g. /coder prompt, /code reviewer prompt)
    if (trimmed.startsWith("/") && /\s+prompt$/i.test(trimmed)) {
      const identifier = trimmed.slice(1).replace(/\s+prompt$/i, "").trim().toLowerCase();
      const found = rolesHook.roles.find((r) => {
        const rSlug = r.slug.toLowerCase();
        const rName = r.name.toLowerCase();
        const rNameClean = rName.replace(/[\r\n\s]+/g, " ");
        const rNameHyphen = rName.replace(/[\r\n\s]+/g, "-");
        return (
          rSlug === identifier ||
          rName === identifier ||
          rNameClean === identifier ||
          rNameHyphen === identifier ||
          rSlug === identifier.replace(/\s+/g, "-") ||
          rSlug.replace(/-/g, " ") === identifier
        );
      });
      if (found) {
        setPromptTarget({
          type: "role",
          roleSlug: found.slug,
          roleName: found.name,
          roleColor: found.color,
        });
        setActiveOverlay("prompt");
      } else {
        addMessage(
          "System",
          `Role "${identifier}" not found. Available roles: ${rolesHook.roles.map((r) => r.name).join(", ")}`,
          "yellow"
        );
      }
      return;
    }

    // Agent roles screen command (/agent roles or /roles)
    if (trimmed === "/agent roles" || trimmed === "/roles") {
      setActiveOverlay("roles");
      return;
    }

    // New blank standalone chat command (/new or /chat new)
    if (trimmed === "/new" || trimmed === "/chat new" || trimmed === "/chats new") {
      session.startBlankChat();
      setScrollOffset(0);
      return;
    }

    // Chats screen command (/chats)
    if (trimmed === "/chats") {
      setActiveOverlay("chats");
      return;
    }

    // Projects screen command (/projects)
    if (trimmed === "/projects") {
      setActiveOverlay("projects");
      return;
    }

    // Queue screen command (/queue)
    if (trimmed === "/queue") {
      setActiveOverlay("queue");
      return;
    }

    // Memory screen command (/memory)
    if (trimmed === "/memory") {
      setActiveOverlay("memory");
      return;
    }

    // Settings screen command (/settings)
    if (trimmed === "/settings") {
      setActiveOverlay("settings");
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
          "  /prompt                  - Select a role to edit its prompt instructions (up to 300 words)",
          "  /prompt <role>           - Shortcut to edit a specific role prompt (e.g. /prompt coder or /coder prompt)",
          "  /chats                   - List, create, rename, pin, or switch chats",
          "  /projects                - Project workspaces and scoped chats",
          "  /queue                   - Open real-time task queue inspector",
          "  /memory                  - View & edit memory scopes, Key Points, and narratives",
          "  /settings                - Configure theme, timeouts, token caps, and safety limits",
          "  /build                   - Switch to BUILD mode (code generation and execution)",
          "  /plan                    - Switch to PLAN mode (architectural breakdown)",
          "  /server stop             - Stop running background model inference servers (Ollama, LM Studio)",
          "  /help                    - Display this command index and shortcut reference",
          "  /exit                    - Cleanly close and exit Vecta",
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
          "",
          "Inside /chats & /projects:",
          "  Up / Down      - Navigate items",
          "  Enter          - Open chat or drill into project workspace",
          "  p              - Toggle pin status",
          "  r              - Rename chat or project inline",
          "  d              - Delete chat or project (press d again to confirm)",
          "  Esc            - Go back or exit",
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
        },
        session.getActiveChatId() || session.activeChatId || "default"
      );
    }
  };

  const appHeight = Math.max(12, terminalSize.rows - 1);
  const sidebarWidth = 30;
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
          onClose={() => {
            rolesHook.refresh();
            setActiveOverlay("none");
          }}
          rolesHook={rolesHook}
          terminalSize={terminalSize}
        />
      </Box>
    );
  }

  // If the prompt overlay is open
  if (activeOverlay === "prompt" && promptTarget) {
    if (promptTarget.type === "picker") {
      return (
        <Box width={terminalSize.columns} height={appHeight}>
          <PromptRolePicker
            roles={rolesHook.roles}
            terminalSize={terminalSize}
            onSelectRole={(role) => {
              setPromptTarget({
                type: "role",
                roleSlug: role.slug,
                roleName: role.name,
                roleColor: role.color,
              });
            }}
            onClose={() => {
              setActiveOverlay("none");
              setPromptTarget(null);
            }}
          />
        </Box>
      );
    }

    const activeRole = rolesHook.roles.find((r) => r.slug === promptTarget.roleSlug);
    const title = `${promptTarget.roleName} Role`;
    const initialVal = activeRole?.prompt || "";
    const roleColor = promptTarget.roleColor;

    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <PromptEditor
          title={title}
          roleSlug={promptTarget.roleSlug}
          initialValue={initialVal}
          roleColor={roleColor}
          terminalSize={terminalSize}
          onSave={(saved) => {
            rolesHook.setRolePrompt(promptTarget.roleSlug, saved);
            addMessage(
              "System",
              `Prompt saved for ${promptTarget.roleName} (${countWords(saved)}/300 words).`,
              "green"
            );
          }}
          onClose={() => {
            setActiveOverlay("none");
            setPromptTarget(null);
          }}
        />
      </Box>
    );
  }

  // If the chats screen is open
  if (activeOverlay === "chats") {
    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <ChatsView
          activeChatId={session.activeChatId}
          terminalSize={terminalSize}
          onSelectChat={(chatId) => {
            session.selectChat(chatId);
            setActiveOverlay("none");
            setScrollOffset(0);
          }}
          onClose={() => setActiveOverlay("none")}
        />
      </Box>
    );
  }

  // If the projects screen is open
  if (activeOverlay === "projects") {
    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <ProjectsView
          activeChatId={session.activeChatId}
          terminalSize={terminalSize}
          onSelectChat={(chatId) => {
            session.selectChat(chatId);
            setActiveOverlay("none");
            setScrollOffset(0);
          }}
          onClose={() => setActiveOverlay("none")}
        />
      </Box>
    );
  }

  // If the queue inspector screen is open
  if (activeOverlay === "queue") {
    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <QueueView
          tasks={tasks}
          activeTask={activeTask}
          isProcessing={isProcessing}
          totalTokensUsed={totalTokensUsed}
          terminalSize={terminalSize}
          onClose={() => setActiveOverlay("none")}
          onClearQueue={clearQueue}
          getRoleColor={rolesHook.getRoleColor}
          roles={rolesHook.roles}
        />
      </Box>
    );
  }

  // If the memory scopes inspector screen is open
  if (activeOverlay === "memory") {
    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <MemoryView
          terminalSize={terminalSize}
          onClose={() => setActiveOverlay("none")}
        />
      </Box>
    );
  }

  // If the global application settings screen is open
  if (activeOverlay === "settings") {
    return (
      <Box width={terminalSize.columns} height={appHeight}>
        <SettingsView
          terminalSize={terminalSize}
          onClose={() => setActiveOverlay("none")}
          onNavigateToRoles={() => setActiveOverlay("roles")}
          onNavigateToMemory={() => setActiveOverlay("memory")}
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
        messages={session.messages}
        onSendMessage={handleUserPrompt}
        getRoleColor={rolesHook.getRoleColor}
        autoAccept={autoAccept}
        availableHeight={appHeight}
        availableWidth={chatWidth}
        scrollOffset={scrollOffset}
        roles={rolesHook.roles}
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
