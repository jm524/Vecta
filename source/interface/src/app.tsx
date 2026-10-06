// Status:: in-progress
// App is the full-screen terminal canvas.
// It dynamically fits the entire PowerShell window, removes bottom clutter, and manages the Manager loop.
import React, { useState, useEffect } from "react";
import { Box, useInput, useApp } from "ink";
import { Chat, type ChatMessage } from "./components/Chat.js";
import { Sidebar, type TaskItem } from "./components/Sidebar.js";
import { useModeTab } from "./hooks/useModeTab.js";
import { engineBridge } from "./bridge/client.js";

export const App: React.FC = () => {
  const { exit } = useApp();
  // Manage mode (PLANNING = "PLAN" / IMPLEMENTATION = "BUILD")
  const { mode } = useModeTab("IMPLEMENTATION");

  // Track dynamic terminal window size so Vecta fills the entire screen
  const [terminalSize, setTerminalSize] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  // Track whether right sidebar is open (Ctrl+Left / Ctrl+Right)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auto-accept edits state (toggled via Shift+Tab or config)
  const [autoAccept, setAutoAccept] = useState(false);

  // Conversation messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Active pipeline tasks
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  // Token counter for the active task
  const [tokensUsed, setTokensUsed] = useState(0);

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
          addMessage("Manager", `Vecta Engine online (v${res.data?.version || "0.0.2"}).`, "cyan");
        }
      } catch (err: any) {
        addMessage("System", `Engine bridge error: ${err.message}`, "red");
      }
    };
    checkBridge();
  }, []);

  // Global shortcut listeners
  useInput((_input, key) => {
    // Ctrl + Right Arrow opens sidebar
    if (key.ctrl && key.rightArrow) {
      setSidebarOpen(true);
    }
    // Ctrl + Left Arrow closes sidebar
    if (key.ctrl && key.leftArrow) {
      setSidebarOpen(false);
    }
    // Shift + Tab toggles Auto-accept
    if (key.shift && key.tab) {
      setAutoAccept((prev) => !prev);
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
      setTimeout(() => {
        addMessage(
          "Manager",
          `[Plan] Deconstructing: "${promptText}". Identifying boundaries and component architecture.`,
          "cyan"
        );
      }, 200);
    } else {
      const lower = promptText.toLowerCase();
      const pipeline: TaskItem[] = [];

      if (lower.includes("auth") || lower.includes("api") || lower.includes("login") || lower.includes("database")) {
        pipeline.push({ id: "1", role: "Backend Engineer", status: "running", description: "API logic" });
        pipeline.push({ id: "2", role: "Security Checker", status: "pending", description: "Security audit" });
      } else if (lower.includes("ui") || lower.includes("component") || lower.includes("button") || lower.includes("screen")) {
        pipeline.push({ id: "1", role: "Frontend Engineer", status: "running", description: "UI component" });
        pipeline.push({ id: "2", role: "Code Reviewer", status: "pending", description: "Code review" });
      } else {
        pipeline.push({ id: "1", role: "Coder", status: "running", description: "Implementation" });
        pipeline.push({ id: "2", role: "Code Reviewer", status: "pending", description: "Code review" });
      }

      pipeline.push({ id: "3", role: "Documenter", status: "pending", description: "Log audit" });

      setTasks(pipeline);
      setTokensUsed(240);

      setTimeout(() => {
        const sequence = pipeline.map((t, i) => `${i + 1}. ${t.role}`).join(" → ");
        addMessage("Manager", `Pipeline assembled: ${sequence}`, "cyan");
      }, 300);
    }
  };

  // Usable height fills terminal minus small padding
  const appHeight = Math.max(12, terminalSize.rows - 1);

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
      />

      {/* Optional Right Sidebar */}
      {sidebarOpen && (
        <Sidebar
          tokensUsed={tokensUsed}
          tasks={tasks}
          height={appHeight}
        />
      )}
    </Box>
  );
};
