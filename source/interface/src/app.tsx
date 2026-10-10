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
import type { QueueDispatchPayload } from "./types/bridge.js";

export const App: React.FC = () => {
  const { exit } = useApp();
  // Manage mode (PLANNING = "PLAN" / IMPLEMENTATION = "BUILD")
  const { mode } = useModeTab("IMPLEMENTATION");

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
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        sender,
        text,
        color,
        timestamp: time,
      },
    ]);
    // Reset scroll offset on new message so user sees newest activity
    setScrollOffset(0);
  };

  const handleUserPrompt = (promptText: string) => {
    // Exit commands
    if (promptText === "/exit" || promptText === "/quit") {
      addMessage("System", "Exiting...", "yellow");
      setTimeout(() => {
        exit();
        engineBridge.stop();
        process.exit(0);
      }, 100);
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

      // Keyword & path heuristics (Sprint Plan §2M)
      if (lower.includes("auth") || lower.includes("api") || lower.includes("login") || lower.includes("database")) {
        pipeline.push({
          taskId: `task-${runId}-1`,
          role: "Backend Engineer",
          stage: 1,
          prompt: promptText,
          filePaths: ["source/engine/"],
          fileBoundaries: ["source/"],
        });
        pipeline.push({
          taskId: `task-${runId}-2`,
          role: "Security Checker",
          stage: 2,
          prompt: "Verify authentication boundary and credential handling",
          filePaths: ["source/engine/"],
          fileBoundaries: ["source/"],
        });
      } else if (lower.includes("ui") || lower.includes("component") || lower.includes("button") || lower.includes("screen") || lower.includes("frontend")) {
        pipeline.push({
          taskId: `task-${runId}-1`,
          role: "Frontend Engineer",
          stage: 1,
          prompt: promptText,
          filePaths: ["source/interface/src/components/"],
          fileBoundaries: ["source/"],
        });
        pipeline.push({
          taskId: `task-${runId}-2`,
          role: "Code Reviewer",
          stage: 2,
          prompt: "Audit component types and layout ergonomics",
          filePaths: ["source/interface/src/components/"],
          fileBoundaries: ["source/"],
        });
      } else {
        pipeline.push({
          taskId: `task-${runId}-1`,
          role: "Coder",
          stage: 1,
          prompt: promptText,
          filePaths: ["source/"],
          fileBoundaries: ["source/"],
        });
        pipeline.push({
          taskId: `task-${runId}-2`,
          role: "Code Reviewer",
          stage: 2,
          prompt: "Inspect implementation correctness",
          filePaths: ["source/"],
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
          // As each task completes, announce it in chat with role color
          const roleColor =
            taskResult.role === "Backend Engineer" || taskResult.role === "Frontend Engineer" || taskResult.role === "Coder"
              ? "green"
              : taskResult.role === "Security Checker" || taskResult.role === "Code Reviewer"
              ? "magenta"
              : "blue";

          addMessage(taskResult.role, taskResult.output, roleColor);
        },
        () => {
          // When all tasks in the pipeline finish
          addMessage("Manager", "All pipeline tasks completed successfully.", "cyan");
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

  return (
    // Fills entire terminal window dynamically
    <Box flexDirection="row" width={terminalSize.columns} height={appHeight} gap={1} padding={0}>
      {/* Main Chat Panel */}
      <Chat
        mode={mode}
        messages={messages}
        onSendMessage={handleUserPrompt}
        autoAccept={autoAccept}
        availableHeight={appHeight}
        availableWidth={chatWidth}
        scrollOffset={scrollOffset}
      />

      {/* Optional Right Sidebar */}
      {sidebarOpen && (
        <Sidebar
          tokensUsed={totalTokensUsed}
          tasks={sidebarTasks}
          height={appHeight}
        />
      )}
    </Box>
  );
};
