// Status:: in-progress
// /roles interactive screen built with Ink.
// Complete redesign matching developer specifications:
// 1. Unified 'Switch agent' menu containing Detected Models, 'No Model', API Key, File Picker, and Rescan Models.
// 2. No rescan models in roster or top-level role view — only inside Switch Agent.
// 3. Compact 'Prompt (300 words max):' preview with abbreviation (...).
// 4. Role-specific prompt editor with 'c' to clear and 'Ctrl+R' to reset to default.
// 5. In-place indented autonomy explanation directly underneath the action line when hovered.
// 6. Full-terminal color palette screen with visual color grid and live chat preview.
// 7. Full-terminal sizing with zero word overlapping or collapsing.
// 8. Plain 5th-grader explanations and strictly zero emojis.

import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useRoles, countWords, type UseRolesReturn } from "../hooks/useRoles.js";
import { type RoleDefinition, type RoleFunction, stripLayer1Rules } from "../../../roles/base.js";
import { PromptEditor, truncateTo300Words } from "./prompt-editor.js";
import type { HardwareInfo } from "../types/bridge.js";
import { isShiftEnter } from "../helpers/keyboard.js";

export interface AgentRolesProps {
  onClose: () => void;
  rolesHook?: UseRolesReturn;
  terminalSize?: { columns: number; rows: number };
}

// 16-color rich palette for terminal styling (Requirement 9)
export const PALETTE_COLORS: Array<{ name: string; color: string; label: string }> = [
  { name: "cyan", color: "cyan", label: "Cyan" },
  { name: "green", color: "green", label: "Green" },
  { name: "yellow", color: "yellow", label: "Yellow" },
  { name: "magenta", color: "magenta", label: "Magenta" },
  { name: "blue", color: "blue", label: "Blue" },
  { name: "red", color: "red", label: "Red" },
  { name: "white", color: "white", label: "White" },
  { name: "gray", color: "gray", label: "Gray" },
  { name: "emerald", color: "#00f076", label: "Emerald" },
  { name: "sky", color: "#00d4ff", label: "Sky Blue" },
  { name: "pink", color: "#ff79c6", label: "Hot Pink" },
  { name: "violet", color: "#bd93f9", label: "Violet" },
  { name: "neon", color: "#f1fa8c", label: "Neon Yellow" },
  { name: "coral", color: "#ff5555", label: "Coral" },
  { name: "amber", color: "#ffb86c", label: "Amber" },
  { name: "mint", color: "#8be9fd", label: "Mint" },
];

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

export function parseColorToHsl(colorStr?: string): { hue: number; lightness: number } {
  const namedMap: Record<string, { hue: number; lightness: number }> = {
    red: { hue: 0, lightness: 50 },
    coral: { hue: 15, lightness: 55 },
    amber: { hue: 35, lightness: 55 },
    neon: { hue: 55, lightness: 60 },
    yellow: { hue: 60, lightness: 50 },
    green: { hue: 120, lightness: 50 },
    emerald: { hue: 140, lightness: 47 },
    mint: { hue: 165, lightness: 65 },
    cyan: { hue: 180, lightness: 50 },
    sky: { hue: 195, lightness: 50 },
    blue: { hue: 220, lightness: 55 },
    violet: { hue: 260, lightness: 65 },
    magenta: { hue: 300, lightness: 50 },
    pink: { hue: 325, lightness: 65 },
    white: { hue: 0, lightness: 90 },
    gray: { hue: 0, lightness: 50 },
  };

  const lower = (colorStr || "").toLowerCase().trim();
  if (namedMap[lower]) {
    return namedMap[lower];
  }

  if (lower.startsWith("#") && lower.length >= 7) {
    const r = parseInt(lower.slice(1, 3), 16) / 255;
    const g = parseInt(lower.slice(3, 5), 16) / 255;
    const b = parseInt(lower.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h = Math.round(h * 60);
    }
    return {
      hue: (h + 360) % 360,
      lightness: Math.round(Math.max(0, Math.min(100, l * 100))),
    };
  }

  return { hue: 180, lightness: 50 };
}

export function rgbToHsl(r: number, g: number, b: number): { hue: number; lightness: number } {
  r = Math.max(0, Math.min(255, r)) / 255;
  g = Math.max(0, Math.min(255, g)) / 255;
  b = Math.max(0, Math.min(255, b)) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
  }
  return {
    hue: (h + 360) % 360,
    lightness: Math.round(l * 100),
  };
}

export function parseHexToHsl(str: string): { hue: number; lightness: number } | null {
  let clean = str.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return rgbToHsl(r, g, b);
}

export function parseRgbToHsl(str: string): { hue: number; lightness: number } | null {
  const clean = str.replace(/rgb\s*\(/i, "").replace(/\)/g, "").trim();
  const parts = clean.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) return null;
  const r = parseInt(parts[0] || "", 10);
  const g = parseInt(parts[1] || "", 10);
  const b = parseInt(parts[2] || "", 10);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
  return rgbToHsl(r, g, b);
}

export function parseHslInput(str: string): { hue: number; lightness: number } | null {
  const clean = str.replace(/hsl\s*\(/i, "").replace(/[%°\)]/g, "").trim();
  const parts = clean.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const h = parseInt(parts[0] || "", 10);
  let l = 50;
  if (parts.length >= 3) {
    l = parseInt(parts[2] || "", 10);
  } else {
    l = parseInt(parts[1] || "", 10);
  }
  if (isNaN(h) || isNaN(l)) return null;
  return {
    hue: ((h % 360) + 360) % 360,
    lightness: Math.max(0, Math.min(100, l)),
  };
}

export const DIAL_LEVELS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

export interface WheelChunk {
  text: string;
  color?: string;
  isPointer?: boolean;
}

export function buildColorWheelRows(
  selHue: number,
  lightness: number,
  size: "large" | "medium" | "compact" = "large"
): WheelChunk[][] {
  const configs = {
    large: { yMax: 6, xMax: 13, maxR: 12.8, minR: 6.0, hubR: 2.8, pointerThreshold: 9.5, diffLimit: 8 },
    medium: { yMax: 5, xMax: 11, maxR: 10.5, minR: 5.0, hubR: 2.4, pointerThreshold: 7.8, diffLimit: 10 },
    compact: { yMax: 4, xMax: 8, maxR: 8.5, minR: 4.0, hubR: 1.9, pointerThreshold: 6.2, diffLimit: 12 },
  };
  const cfg = configs[size] || configs.large;
  const rows: WheelChunk[][] = [];

  for (let y = -cfg.yMax; y <= cfg.yMax; y++) {
    const rowChunks: WheelChunk[] = [];
    let curText = "";
    let curColor = "";
    let curIsPointer = false;

    for (let x = -cfg.xMax; x <= cfg.xMax; x++) {
      const r = Math.sqrt(x * x + (y * 2.1) * (y * 2.1));
      let char = " ";
      let color = "";
      let isPointer = false;

      if (r >= cfg.minR && r <= cfg.maxR) {
        let angle = (Math.atan2(-y * 2.1, x) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        let diff = Math.abs(angle - selHue);
        if (diff > 180) diff = 360 - diff;
        isPointer = diff < cfg.diffLimit && r >= cfg.pointerThreshold;
        color = hslToHex(angle, 100, lightness);
        char = isPointer ? "◉" : "█";
      } else if (r <= cfg.hubR) {
        color = hslToHex(selHue, 100, lightness);
        char = "█";
      }

      if (char === " ") {
        if (curColor === "" && !curIsPointer) {
          curText += " ";
        } else {
          if (curText) rowChunks.push({ text: curText, color: curColor, isPointer: curIsPointer });
          curText = " ";
          curColor = "";
          curIsPointer = false;
        }
      } else if (isPointer) {
        if (curText) rowChunks.push({ text: curText, color: curColor, isPointer: curIsPointer });
        rowChunks.push({ text: "◉", color, isPointer: true });
        curText = "";
        curColor = "";
        curIsPointer = false;
      } else {
        if (curColor === color && !curIsPointer) {
          curText += char;
        } else {
          if (curText) rowChunks.push({ text: curText, color: curColor, isPointer: curIsPointer });
          curText = char;
          curColor = color;
          curIsPointer = false;
        }
      }
    }
    if (curText) rowChunks.push({ text: curText, color: curColor, isPointer: curIsPointer });
    rows.push(rowChunks);
  }
  return rows;
}

// 5-Step Custom Role Wizard Function Categories (Claude Doc 21)
export const WIZARD_FUNCTIONS: Array<{ func: RoleFunction; label: string; desc: string }> = [
  { func: "Orchestrators", label: "Orchestrator", desc: "Coordinates and plans tasks — never runs in queue" },
  { func: "Builders", label: "Builder", desc: "Stage 1 — writes and generates code and components" },
  { func: "Checkers", label: "Checker", desc: "Stage 2 — reviews, audits, and validates what Builders made" },
  { func: "Finalizers", label: "Finalizer", desc: "Stage 3 — wraps up, generates release notes and documentation" },
  { func: "Other", label: "Other", desc: "Flexible — Manager dynamically decides pipeline placement" },
];

export function getDefaultDutyForFunction(func: RoleFunction): string {
  switch (func) {
    case "Orchestrators":
      return "coordinate and plan tasks assigned to you by Manager.";
    case "Builders":
      return "write and generate code to complete the tasks assigned to you by Manager.";
    case "Checkers":
      return "review and validate the work produced by Builders to ensure correctness.";
    case "Finalizers":
      return "document and summarize completed work to provide clear project records.";
    default:
      return "complete specialized tasks assigned to you by Manager.";
  }
}

// Plain 5th-grader recommendations with OS-specific pull & setup commands based on hardware scan (Item 3)
function getRecommendationsForRole(
  role: RoleDefinition,
  hardware?: HardwareInfo | null
): Array<{ agent: string; reason: string; pullCmd: string; setupCmd: string }> {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const getSetup = (tag: string) =>
    isWin
      ? `winget install Ollama.Ollama; ollama run ${tag}`
      : isMac
      ? `brew install ollama && ollama run ${tag}`
      : `curl -fsSL https://ollama.com/install.sh | sh && ollama run ${tag}`;

  const ramGb = hardware?.totalRamGb
    ? parseFloat(hardware.totalRamGb)
    : hardware?.totalRamBytes
    ? hardware.totalRamBytes / (1024 * 1024 * 1024)
    : 16;
  const isHeavyRam = ramGb >= 30;
  const isLightRam = ramGb < 14;
  const ramTag = `${Math.round(ramGb)}GB RAM`;

  switch (role.roleFunction) {
    case "Orchestrators":
      return [
        {
          agent: "Claude 3.5 Sonnet (Cloud)",
          reason: `Top architectural planner (Hardware scan: ${ramTag}, cloud requires 0GB VRAM)`,
          pullCmd: "Cloud API (no local download)",
          setupCmd: "Set API key in switch agent",
        },
        {
          agent: isHeavyRam ? "Llama 3.1 70B (Local)" : isLightRam ? "Llama 3.2 3B (Local)" : "Llama 3.1 8B (Local)",
          reason: isHeavyRam
            ? `Hardware scan: ${ramTag} comfortably runs 70B model for heavy multi-turn planning`
            : isLightRam
            ? `Hardware scan: ${ramTag} runs 3B model safely without memory exhaustion`
            : `Hardware scan: ${ramTag} optimal balance for 8B local planning`,
          pullCmd: isHeavyRam ? "ollama run llama3.1:70b" : isLightRam ? "ollama run llama3.2:3b" : "ollama run llama3.1:8b",
          setupCmd: getSetup(isHeavyRam ? "llama3.1:70b" : isLightRam ? "llama3.2:3b" : "llama3.1:8b"),
        },
      ];
    case "Builders":
      return [
        {
          agent: isHeavyRam ? "Qwen 2.5 Coder 32B (Local)" : isLightRam ? "Qwen 2.5 Coder 7B (Local)" : "Qwen 2.5 Coder 14B (Local)",
          reason: isHeavyRam
            ? `Hardware scan: ${ramTag} handles state-of-the-art 32B code synthesis`
            : isLightRam
            ? `Hardware scan: ${ramTag} recommended 7B coder to prevent out-of-memory errors`
            : `Hardware scan: ${ramTag} balances 14B coding depth and token speed`,
          pullCmd: isHeavyRam ? "ollama run qwen2.5-coder:32b" : isLightRam ? "ollama run qwen2.5-coder:7b" : "ollama run qwen2.5-coder:14b",
          setupCmd: getSetup(isHeavyRam ? "qwen2.5-coder:32b" : isLightRam ? "qwen2.5-coder:7b" : "qwen2.5-coder:14b"),
        },
        {
          agent: "Claude 3.5 Sonnet (Cloud)",
          reason: `Top tier multi-file refactoring and engineering precision (Hardware scan: ${ramTag})`,
          pullCmd: "Cloud API (no local download)",
          setupCmd: "Set API key in switch agent",
        },
      ];
    case "Checkers":
      return [
        {
          agent: isHeavyRam ? "DeepSeek R1 14B (Local)" : isLightRam ? "DeepSeek R1 7B (Local)" : "DeepSeek R1 8B (Local)",
          reason: isHeavyRam
            ? `Hardware scan: ${ramTag} runs 14B reasoning model for deep logic audits`
            : isLightRam
            ? `Hardware scan: ${ramTag} runs 7B reasoning safely within memory limits`
            : `Hardware scan: ${ramTag} fast logic audits, edge-case analysis, and safety checks`,
          pullCmd: isHeavyRam ? "ollama run deepseek-r1:14b" : isLightRam ? "ollama run deepseek-r1:7b" : "ollama run deepseek-r1:8b",
          setupCmd: getSetup(isHeavyRam ? "deepseek-r1:14b" : isLightRam ? "deepseek-r1:7b" : "deepseek-r1:8b"),
        },
        {
          agent: "Claude 3.5 Sonnet (Cloud)",
          reason: `Zero-hallucination code review, vulnerability detection, and diff analysis`,
          pullCmd: "Cloud API (no local download)",
          setupCmd: "Set API key in switch agent",
        },
      ];
    case "Finalizers":
      return [
        {
          agent: isLightRam ? "Llama 3.2 3B (Local)" : "Llama 3.1 8B (Local)",
          reason: isLightRam
            ? `Hardware scan: ${ramTag} generates structured markdown with minimal memory usage`
            : `Hardware scan: ${ramTag} fast structured markdown generation and low memory footprint`,
          pullCmd: isLightRam ? "ollama run llama3.2:3b" : "ollama run llama3.1:8b",
          setupCmd: getSetup(isLightRam ? "llama3.2:3b" : "llama3.1:8b"),
        },
        {
          agent: "Claude 3.5 Haiku (Cloud)",
          reason: `Lightning fast summary and release notes generation`,
          pullCmd: "Cloud API (no local download)",
          setupCmd: "Set API key in switch agent",
        },
      ];
    default:
      return [
        {
          agent: isLightRam ? "Llama 3.2 3B (Local)" : "Llama 3.1 8B (Local)",
          reason: `Hardware scan: ${ramTag} balanced general-purpose assistant`,
          pullCmd: isLightRam ? "ollama run llama3.2:3b" : "ollama run llama3.1:8b",
          setupCmd: getSetup(isLightRam ? "llama3.2:3b" : "llama3.1:8b"),
        },
        {
          agent: "Claude 3.5 Sonnet (Cloud)",
          reason: `High-intelligence fallback for custom workflows`,
          pullCmd: "Cloud API (no local download)",
          setupCmd: "Set API key in switch agent",
        },
      ];
  }
}

// Helper to open native OS file dialog if supported (Requirement 2)
async function tryOpenNativeFileDialog(): Promise<string | null> {
  try {
    const { exec } = await import("child_process");
    if (process.platform === "win32") {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Model files (*.gguf;*.bin;*.safetensors)|*.gguf;*.bin;*.safetensors|All files (*.*)|*.*'; $f.Title = 'Select Local AI Model'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.FileName }`;
      return new Promise((resolve) => {
        exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, " ")}"`, (err, stdout) => {
          if (err || !stdout.trim()) resolve(null);
          else resolve(stdout.trim());
        });
      });
    } else if (process.platform === "darwin") {
      return new Promise((resolve) => {
        exec(`osascript -e 'POSIX path of (choose file with prompt "Select Local AI Model File")'`, (err, stdout) => {
          if (err || !stdout.trim()) resolve(null);
          else resolve(stdout.trim());
        });
      });
    }
  } catch {
    return null;
  }
  return null;
}

export const AgentRoles: React.FC<AgentRolesProps> = ({ onClose, rolesHook, terminalSize }) => {
  const localHook = useRoles();
  const hook = rolesHook || localHook;

  const width = Math.max(40, terminalSize?.columns || process.stdout.columns || 80);
  const height = Math.max(10, (terminalSize?.rows || process.stdout.rows || 24) - 1);

  // Screen view state
  const [view, setView] = useState<"roster" | "drilldown" | "switch_agent" | "color_palette" | "edit_prompt" | "input_text" | "wizard">("roster");

  // Roster cursor index
  const [rosterIndex, setRosterIndex] = useState(0);

  // Selected role slug
  const [selectedRoleSlug, setSelectedRoleSlug] = useState<string | null>(null);

  // Drilldown action cursor index
  const [drilldownActionIndex, setDrilldownActionIndex] = useState(0);

  // Switch Agent sub-menu cursor index (Requirement 7)
  const [switchAgentIndex, setSwitchAgentIndex] = useState(0);
  const [browsingDetectedModels, setBrowsingDetectedModels] = useState(false);
  const [detectedModelIndex, setDetectedModelIndex] = useState(0);

  // Color palette grid index (0 to 15)
  const [paletteIndex, setPaletteIndex] = useState(0);
  // Color wheel state (Hue 0-359°, Lightness 0-100%)
  const [wheelHue, setWheelHue] = useState(180);
  const [wheelLightness, setWheelLightness] = useState(50);
  // Color wheel focus and interactive input boxes (Requirement 10)
  const [colorFocus, setColorFocus] = useState<"wheel" | "hex" | "rgb" | "hsl">("wheel");
  const [hexInput, setHexInput] = useState("");
  const [rgbInput, setRgbInput] = useState("");
  const [hslInput, setHslInput] = useState("");
  // Color palette vertical scroll offset for small terminal heights
  const [colorScrollOffset, setColorScrollOffset] = useState(0);
  const maxColorScrollRef = React.useRef(0);


  // Generic text input buffer for API key or custom path
  const [textBuffer, setTextBuffer] = useState("");
  const [inputTitle, setInputTitle] = useState("");
  const [inputAction, setInputAction] = useState<"api_key" | "custom_path" | "custom_name" | "wizard_name" | "wizard_desc" | null>(null);
  const [tempCustomPath, setTempCustomPath] = useState("");

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Clear feedback message and reset scroll offset whenever view transitions
  useEffect(() => {
    setFeedbackMsg(null);
    setColorScrollOffset(0);
  }, [view]);

  // Auto-dismiss feedback message after 3.5 seconds so it doesn't linger indefinitely
  useEffect(() => {
    if (!feedbackMsg) return;
    const timer = setTimeout(() => {
      setFeedbackMsg(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [feedbackMsg]);

  // 4-Step Wizard state for custom roles
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardFuncIndex, setWizardFuncIndex] = useState(1); // default Builders
  const [wizardAgentIndex, setWizardAgentIndex] = useState(0); // default Detected Models
  const [browsingWizardDetectedModels, setBrowsingWizardDetectedModels] = useState(false);
  const [wizardDetectedModelIndex, setWizardDetectedModelIndex] = useState(0);
  const [wizardData, setWizardData] = useState<{
    name: string;
    roleFunction: RoleFunction;
    functionDescription: string;
    model: string;
    assignmentType: "local" | "cloud" | "custom_path";
    customPath?: string;
    apiKey?: string;
    basePrompt: string;
    prompt: string;
  }>({
    name: "",
    roleFunction: "Builders",
    functionDescription: "",
    model: "No Agent",
    assignmentType: "local",
    basePrompt: "",
    prompt: "",
  });

  const [wizardNameCursor, setWizardNameCursor] = useState(0);
  const [wizardPromptCursor, setWizardPromptCursor] = useState(0);

  // Synchronous refs to prevent stale closure when holding backspace/delete in wizard
  const wizardDataRef = React.useRef(wizardData);
  wizardDataRef.current = wizardData;
  const wizardNameCursorRef = React.useRef(wizardNameCursor);
  wizardNameCursorRef.current = wizardNameCursor;
  const wizardPromptCursorRef = React.useRef(wizardPromptCursor);
  wizardPromptCursorRef.current = wizardPromptCursor;

  // Multi-line cursor and line calculations for Wizard Step 4 (Prompt canvas with '>' line indicator)
  const { wizardLines, wizardCursorLine, wizardCursorCol } = useMemo(() => {
    const rawLines = (wizardData.basePrompt || "").split("\n");
    let cLine = 0;
    let cCol = 0;
    let charOffset = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const lineLen = rawLines[i]!.length;
      if (wizardPromptCursor >= charOffset && wizardPromptCursor <= charOffset + lineLen) {
        cLine = i;
        cCol = wizardPromptCursor - charOffset;
        break;
      }
      charOffset += lineLen + 1;
    }

    return {
      wizardLines: rawLines,
      wizardCursorLine: cLine,
      wizardCursorCol: cCol,
    };
  }, [wizardData.basePrompt, wizardPromptCursor]);

  const maxWizardVisibleLines = Math.max(4, height - 12);
  const wizardScrollOffset = useMemo(() => {
    if (wizardCursorLine < maxWizardVisibleLines) {
      return 0;
    }
    return wizardCursorLine - maxWizardVisibleLines + 1;
  }, [wizardCursorLine, maxWizardVisibleLines]);

  const visibleWizardLines = wizardLines.slice(
    wizardScrollOffset,
    wizardScrollOffset + maxWizardVisibleLines
  );

  const wizardScrollbarRows = useMemo(() => {
    if (wizardLines.length <= maxWizardVisibleLines) {
      return [];
    }
    const scrollbarHeight = maxWizardVisibleLines;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxWizardVisibleLines / wizardLines.length) * scrollbarHeight))
    );
    const maxScroll = wizardLines.length - maxWizardVisibleLines;
    const scrollRatio = maxScroll > 0 ? wizardScrollOffset / maxScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    const rows = [];
    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      rows.push({ index: i, isThumb });
    }
    return rows;
  }, [wizardLines.length, maxWizardVisibleLines, wizardScrollOffset]);

  // Active role lookup
  const activeRole: RoleDefinition | undefined = hook.roles.find((r) => r.slug === selectedRoleSlug);

  // Role groups for clean roster presentation
  const orchestrators = hook.roles.filter((r) => r.roleFunction === "Orchestrators");
  const builders = hook.roles.filter((r) => r.roleFunction === "Builders" && !r.isCustom);
  const checkers = hook.roles.filter((r) => r.roleFunction === "Checkers" && !r.isCustom);
  const finalizers = hook.roles.filter((r) => r.roleFunction === "Finalizers" && !r.isCustom);
  const customRoles = hook.roles.filter((r) => r.isCustom || r.roleFunction === "Other");

  // Flattened navigation list for roster
  interface NavItem {
    type: "role" | "add_custom";
    role?: RoleDefinition;
    label: string;
  }
  const navItems: NavItem[] = [
    ...orchestrators.map((r) => ({ type: "role" as const, role: r, label: r.name })),
    ...builders.map((r) => ({ type: "role" as const, role: r, label: r.name })),
    ...checkers.map((r) => ({ type: "role" as const, role: r, label: r.name })),
    ...finalizers.map((r) => ({ type: "role" as const, role: r, label: r.name })),
    ...customRoles.map((r) => ({ type: "role" as const, role: r, label: r.name })),
    { type: "add_custom" as const, label: "+ Add custom role" },
  ];

  // Helper for fit badge (Requirement 9: never return "(No Model)" redundantly)
  const getFitBadge = (role: RoleDefinition): string => {
    if (role.assignmentType === "cloud") return "(API key set)";
    if (role.assignmentType === "custom_path") return "(custom)";
    if (!role.model || role.model === "not assigned" || role.model === "No Model" || role.model === "No Agent") return "";

    const rating = hook.getModelFitRating(role.model);
    if (rating === "Optimal") return "[Optimal]";
    if (rating === "Good") return "[Good]";
    if (rating === "Tight") return "[Tight]";
    if (rating === "Too Heavy") return "[Too Heavy]";
    return "(local)";
  };

  // Actions for the 'Switch agent' menu (Requirement 7 & 11)
  interface SwitchAgentAction {
    id: "detected_models" | "no_agent" | "api_key" | "file_picker" | "rescan" | "back";
    label: string;
  }

  const switchAgentActions: SwitchAgentAction[] = [
    { id: "detected_models", label: "Detected Models" },
    { id: "no_agent", label: "No Agent" },
    { id: "api_key", label: "Input an API Key (Claude / OpenAI / Gemini)" },
    { id: "file_picker", label: "Manually point to file..." },
    { id: "rescan", label: "Rescan models" },
    { id: "back", label: "Back to role details" },
  ];

  // Actions for Step 3 of the Custom Role Wizard (Item 1)
  interface WizardAgentAction {
    id: "detected_models" | "no_agent" | "api_key" | "file_picker" | "rescan";
    label: string;
  }

  const wizardAgentActions: WizardAgentAction[] = [
    { id: "detected_models", label: "Detected Models" },
    { id: "no_agent", label: "No Agent (assign later)" },
    { id: "api_key", label: "Input Cloud API Key (Claude / OpenAI / Gemini)" },
    { id: "file_picker", label: "Manually point to file or URL..." },
    { id: "rescan", label: "Rescan models" },
  ];

  // Actions for the role drilldown view
  interface DrillAction {
    id: "switch_agent" | "autonomy" | "role_color" | "edit_prompt" | "keep_loaded" | "delete_custom" | "back";
    label: string;
    explanation?: string;
  }

  const drillActions: DrillAction[] = [
    { id: "switch_agent", label: "Switch agent" },
    ...(activeRole && activeRole.roleFunction === "Checkers"
      ? [
          {
            id: "autonomy" as const,
            label: `Autonomy toward Builders: [${(activeRole.autonomy || "off").toUpperCase()}] (Press Enter to toggle)`,
            explanation:
              activeRole.autonomy === "full"
                ? "Checker sends fix directly to Builder. Manager logs in sidebar."
                : "Checker reports issue to Manager. Manager asks you before routing fix.",
          },
        ]
      : []),
    { id: "role_color", label: `Role color: [${activeRole?.color || "cyan"}]` },
    {
      id: "edit_prompt",
      label: `Edit prompt for ${activeRole?.name || "role"}`,
      explanation: `Shortcut: /prompt ${activeRole?.slug} or /${activeRole?.slug} prompt`,
    },
    { id: "keep_loaded", label: `Keep model loaded: [${activeRole?.keepLoaded ? "on" : "off"}] (Press Enter to toggle)` },
    ...(activeRole?.isCustom ? [{ id: "delete_custom" as const, label: `Delete custom role ${activeRole.name}` }] : []),
    { id: "back", label: "Back to roles (Esc)" },
  ];

  // Keyboard & mouse wheel navigation
  useInput((input, key) => {
    // Detect mouse wheel / touchpad scroll events across all terminal formats
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

    if (isWheelUp || isWheelDown) {
      if (view === "color_palette") {
        if (isWheelUp) {
          setColorScrollOffset((prev) => Math.max(0, Math.min(maxColorScrollRef.current, prev) - 2));
        } else {
          setColorScrollOffset((prev) => Math.min(maxColorScrollRef.current, prev + 2));
        }
        return;
      }
      return;
    }

    // Terminal mouse events (touchpad/mouse clicks, drags) - strictly ignored
    if (
      input.startsWith("\x1b[<") ||
      input.startsWith("[<") ||
      input === "[4" ||
      /^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input)
    ) {
      return;
    }
    // -------------------------------------------------------------------------
    // 0. 4-STEP CUSTOM ROLE WIZARD (Steps 1-4 with Left/Right navigation)
    // -------------------------------------------------------------------------
    if (view === "wizard") {
      // Escape at any step exits wizard cleanly back to roster
      if (key.escape) {
        setView("roster");
        setFeedbackMsg(null);
        return;
      }

      // Step 1: Role Name (Single connected word only, e.g. batman or egg-head)
      if (wizardStep === 1) {
        // Enter: advance to Step 2 (Right arrow does NOT switch pages)
        if (key.return) {
          const trimmed = wizardDataRef.current.name.trim();
          if (!trimmed) {
            setFeedbackMsg("Please type a role name (e.g. 'batman' or 'egg-head').");
            return;
          }
          if (/\s/.test(trimmed)) {
            setFeedbackMsg("Role name must be a single connected word without spaces.");
            return;
          }
          if (!wizardDataRef.current.basePrompt) {
            const defaultPrompt = `You are a ${trimmed}. You ${getDefaultDutyForFunction(wizardDataRef.current.roleFunction)}`;
            wizardDataRef.current.basePrompt = defaultPrompt;
            wizardPromptCursorRef.current = defaultPrompt.length;
            setWizardData((prev) => ({
              ...prev,
              basePrompt: defaultPrompt,
            }));
            setWizardPromptCursor(defaultPrompt.length);
          }
          setFeedbackMsg(null);
          setWizardStep(2);
          return;
        }

        // Left/Right Arrow: move cursor through the role name
        if (key.leftArrow) {
          const newCur = Math.max(0, wizardNameCursorRef.current - 1);
          wizardNameCursorRef.current = newCur;
          setWizardNameCursor(newCur);
          return;
        }
        if (key.rightArrow) {
          const curName = wizardDataRef.current.name || "";
          const newCur = Math.min(curName.length, wizardNameCursorRef.current + 1);
          wizardNameCursorRef.current = newCur;
          setWizardNameCursor(newCur);
          return;
        }

        // Home / End keys for name field
        if (input === "\x1b[H" || input === "\x1b[1~") {
          wizardNameCursorRef.current = 0;
          setWizardNameCursor(0);
          return;
        }
        if (input === "\x1b[F" || input === "\x1b[4~") {
          const len = (wizardDataRef.current.name || "").length;
          wizardNameCursorRef.current = len;
          setWizardNameCursor(len);
          return;
        }

        // Backspace / Delete: ALWAYS deletes character before cursor (standard backspace)
        const isBackspaceOrDelete = Boolean(
          key.backspace ||
          key.delete ||
          input === "\x08" ||
          input === "\x7f" ||
          input === "\b" ||
          input === "\x1b[3~" ||
          input === "\u001b[3~" ||
          input.includes("\x08") ||
          input.includes("\x7f") ||
          input.includes("\x1b[3~")
        );
        if (isBackspaceOrDelete) {
          const cur = wizardNameCursorRef.current;
          const currentName = wizardDataRef.current.name || "";
          const bsMatches = input.match(/[\x08\x7f\b]/g);
          const delMatches = input.match(/\x1b\[3~/g);
          const repeatCount = (bsMatches ? bsMatches.length : 0) + (delMatches ? delMatches.length : 0) || 1;
          const deleteCount = Math.min(cur, repeatCount);
          if (deleteCount > 0) {
            const newName = currentName.slice(0, cur - deleteCount) + currentName.slice(cur);
            const newCur = cur - deleteCount;
            wizardDataRef.current.name = newName;
            wizardNameCursorRef.current = newCur;
            setWizardData((prev) => ({ ...prev, name: newName }));
            setWizardNameCursor(newCur);
          }
          return;
        }

        // Spacebar is blocked: custom role names must be single connected words
        if (input === " " || input.includes(" ")) {
          setFeedbackMsg("Role names must be a single connected word (e.g. 'batman' or 'egg-head').");
          return;
        }

        // Connected word characters: letters, digits, hyphens, and underscores only
        if (
          input &&
          !key.ctrl &&
          !key.meta &&
          input !== "\r" &&
          input !== "\n" &&
          !input.startsWith("\x1b") &&
          !input.startsWith("[<") &&
          !/^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input) &&
          input !== "[4"
        ) {
          const clean = input.replace(/[^a-zA-Z0-9_\-]/g, "");
          if (clean) {
            const cur = wizardNameCursorRef.current;
            const currentName = wizardDataRef.current.name || "";
            const newName = currentName.slice(0, cur) + clean + currentName.slice(cur);
            const newCur = cur + clean.length;
            wizardDataRef.current.name = newName;
            wizardNameCursorRef.current = newCur;
            setWizardData((prev) => ({ ...prev, name: newName }));
            setWizardNameCursor(newCur);
            setFeedbackMsg(null);
          } else {
            setFeedbackMsg("Only letters, numbers, hyphens, and underscores are allowed (e.g. 'egg-head').");
          }
          return;
        }
        return;
      }

      // Step 2: Role Function (Up/Down + Enter to select, arrows do NOT switch pages)
      if (wizardStep === 2) {
        if (key.upArrow) {
          setWizardFuncIndex((prev) => (prev > 0 ? prev - 1 : WIZARD_FUNCTIONS.length - 1));
          return;
        }
        if (key.downArrow) {
          setWizardFuncIndex((prev) => (prev < WIZARD_FUNCTIONS.length - 1 ? prev + 1 : 0));
          return;
        }
        if (key.return) {
          const pickedFunc = WIZARD_FUNCTIONS[wizardFuncIndex]?.func || "Builders";
          setWizardData((prev) => ({
            ...prev,
            roleFunction: pickedFunc,
            basePrompt: `You are a ${prev.name || "Custom Role"}. You ${getDefaultDutyForFunction(pickedFunc)}`,
          }));
          setWizardStep(3);
          return;
        }
        return;
      }

      // Step 3: Assign Agent (Up/Down + Enter to select, arrows do NOT switch pages)
      if (wizardStep === 3) {
        if (browsingWizardDetectedModels) {
          if (key.escape) {
            setBrowsingWizardDetectedModels(false);
            return;
          }
          if (key.upArrow) {
            setWizardDetectedModelIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, hook.catalog.length - 1)));
            return;
          }
          if (key.downArrow) {
            setWizardDetectedModelIndex((prev) => (prev < hook.catalog.length - 1 ? prev + 1 : 0));
            return;
          }
          if (key.return) {
            const picked = hook.catalog[wizardDetectedModelIndex];
            if (picked) {
              setWizardData((prev) => ({
                ...prev,
                model: picked.name,
                assignmentType: "local",
              }));
              setBrowsingWizardDetectedModels(false);
              setWizardStep(4);
            }
            return;
          }
          return;
        }

        if (key.upArrow) {
          setWizardAgentIndex((prev) => (prev > 0 ? prev - 1 : wizardAgentActions.length - 1));
          return;
        }
        if (key.downArrow) {
          setWizardAgentIndex((prev) => (prev < wizardAgentActions.length - 1 ? prev + 1 : 0));
          return;
        }
        if (key.return) {
          const action = wizardAgentActions[wizardAgentIndex] || wizardAgentActions[0]!;
          if (action.id === "detected_models") {
            if (hook.catalog.length === 0) {
              setFeedbackMsg("No local models detected on disk. Pull a model or configure an API key.");
            } else {
              setBrowsingWizardDetectedModels(true);
              setWizardDetectedModelIndex(0);
            }
            return;
          }
          if (action.id === "no_agent") {
            setWizardData((prev) => ({
              ...prev,
              model: "No Agent",
              assignmentType: "local",
            }));
            setWizardStep(4);
            return;
          }
          if (action.id === "api_key") {
            setTextBuffer("");
            setInputTitle(`Enter Cloud API Key for ${wizardData.name}:`);
            setInputAction("api_key");
            setView("input_text");
            return;
          }
          if (action.id === "file_picker") {
            tryOpenNativeFileDialog().then((pickedPath) => {
              if (pickedPath) {
                setWizardData((prev) => ({
                  ...prev,
                  model: pickedPath.split(/[\\/]/).pop() || "Custom Model",
                  customPath: pickedPath,
                  assignmentType: "custom_path",
                }));
                setWizardStep(4);
              } else {
                setTextBuffer("");
                setInputTitle(`Enter model file path or endpoint URL for ${wizardData.name}:`);
                setInputAction("custom_path");
                setView("input_text");
              }
            });
            return;
          }
          if (action.id === "rescan") {
            setFeedbackMsg("Rescanning hardware & model files...");
            hook.rescanModels().then(() => {
              setFeedbackMsg("Model catalog rescan complete.");
            });
            return;
          }
          return;
        }
        return;
      }

      // Step 4: Prompt (300 words max) — final step of Custom Role Wizard
      // Fully matches PromptEditor behavior: multi-line navigation, '>' active line, Shift+Enter, hold delete
      if (wizardStep === 4) {
        if (isShiftEnter(key, input)) {
          const cur = wizardPromptCursorRef.current;
          const text = wizardDataRef.current.basePrompt || "";
          const newText = text.slice(0, cur) + "\n" + text.slice(cur);
          const newCursor = cur + 1;
          wizardDataRef.current.basePrompt = newText;
          wizardPromptCursorRef.current = newCursor;
          setWizardData((prev) => ({ ...prev, basePrompt: newText }));
          setWizardPromptCursor(newCursor);
          return;
        }

        // Left/Right Arrow: move cursor left/right (never switches pages)
        if (key.leftArrow) {
          const newCursor = Math.max(0, wizardPromptCursorRef.current - 1);
          wizardPromptCursorRef.current = newCursor;
          setWizardPromptCursor(newCursor);
          return;
        }
        if (key.rightArrow) {
          const text = wizardDataRef.current.basePrompt || "";
          const newCursor = Math.min(text.length, wizardPromptCursorRef.current + 1);
          wizardPromptCursorRef.current = newCursor;
          setWizardPromptCursor(newCursor);
          return;
        }

        // Up/Down Arrow: line navigation through prompt canvas
        if (key.upArrow) {
          if (wizardCursorLine > 0) {
            let prevOffset = 0;
            for (let i = 0; i < wizardCursorLine - 1; i++) {
              prevOffset += wizardLines[i]!.length + 1;
            }
            const prevLen = wizardLines[wizardCursorLine - 1]!.length;
            const targetCol = Math.min(wizardCursorCol, prevLen);
            const newCursor = prevOffset + targetCol;
            wizardPromptCursorRef.current = newCursor;
            setWizardPromptCursor(newCursor);
          } else {
            wizardPromptCursorRef.current = 0;
            setWizardPromptCursor(0);
          }
          return;
        }

        if (key.downArrow) {
          if (wizardCursorLine < wizardLines.length - 1) {
            let nextOffset = 0;
            for (let i = 0; i <= wizardCursorLine; i++) {
              nextOffset += wizardLines[i]!.length + 1;
            }
            const nextLen = wizardLines[wizardCursorLine + 1]!.length;
            const targetCol = Math.min(wizardCursorCol, nextLen);
            const newCursor = nextOffset + targetCol;
            wizardPromptCursorRef.current = newCursor;
            setWizardPromptCursor(newCursor);
          } else {
            const text = wizardDataRef.current.basePrompt || "";
            wizardPromptCursorRef.current = text.length;
            setWizardPromptCursor(text.length);
          }
          return;
        }

        // Reset prompt (Ctrl+R)
        if (key.ctrl && (input === "r" || input === "R")) {
          const defaultPrompt = `You are a ${wizardDataRef.current.name || "Custom Role"}. You ${getDefaultDutyForFunction(wizardDataRef.current.roleFunction)}`;
          wizardDataRef.current.basePrompt = defaultPrompt;
          wizardPromptCursorRef.current = defaultPrompt.length;
          setWizardData((prev) => ({
            ...prev,
            basePrompt: defaultPrompt,
          }));
          setWizardPromptCursor(defaultPrompt.length);
          setFeedbackMsg("Prompt reset to suggested default.");
          return;
        }

        // Clear prompt (Ctrl+K)
        if (key.ctrl && (input === "k" || input === "K")) {
          wizardDataRef.current.basePrompt = "";
          wizardPromptCursorRef.current = 0;
          setWizardData((prev) => ({ ...prev, basePrompt: "" }));
          setWizardPromptCursor(0);
          setFeedbackMsg("Prompt cleared.");
          return;
        }

        // Enter: creates and completes custom role (Ctrl+Enter strictly ignored)
        if (key.return && !key.ctrl && input !== "\n") {
          const finalPrompt = truncateTo300Words(wizardDataRef.current.basePrompt || "");
          hook.addCustomRole({
            name: wizardDataRef.current.name.trim(),
            roleFunction: wizardDataRef.current.roleFunction,
            description: wizardDataRef.current.functionDescription || `${wizardDataRef.current.name.trim()} custom role`,
            model: wizardDataRef.current.model || "No Agent",
            assignmentType: wizardDataRef.current.assignmentType,
            customPath: wizardDataRef.current.customPath,
            prompt: finalPrompt,
          });
          setFeedbackMsg(`Successfully created custom role "${wizardDataRef.current.name.trim()}".`);
          setView("roster");
          return;
        }

        // Backspace / Delete: ALWAYS deletes character before cursor (standard backspace)
        const isBackspaceOrDelete = Boolean(
          key.backspace ||
          key.delete ||
          input === "\x08" ||
          input === "\x7f" ||
          input === "\b" ||
          input === "\x1b[3~" ||
          input === "\u001b[3~" ||
          input.includes("\x08") ||
          input.includes("\x7f") ||
          input.includes("\x1b[3~")
        );
        if (isBackspaceOrDelete) {
          const cur = wizardPromptCursorRef.current;
          const text = wizardDataRef.current.basePrompt || "";
          const bsMatches = input.match(/[\x08\x7f\b]/g);
          const delMatches = input.match(/\x1b\[3~/g);
          const repeatCount = (bsMatches ? bsMatches.length : 0) + (delMatches ? delMatches.length : 0) || 1;
          const deleteCount = Math.min(cur, repeatCount);
          if (deleteCount > 0) {
            const newText = text.slice(0, cur - deleteCount) + text.slice(cur);
            const newCursor = cur - deleteCount;
            wizardDataRef.current.basePrompt = newText;
            wizardPromptCursorRef.current = newCursor;
            setWizardData((prev) => ({ ...prev, basePrompt: newText }));
            setWizardPromptCursor(newCursor);
          }
          return;
        }

        // Printable characters
        if (
          input &&
          !key.ctrl &&
          !key.meta &&
          input !== "\r" &&
          input !== "\n" &&
          !input.startsWith("\x1b") &&
          !input.startsWith("[<") &&
          !/^\[<?\d*;?\d*;?\d*[Mm]?$/.test(input) &&
          input !== "[4"
        ) {
          const cur = wizardPromptCursorRef.current;
          const text = wizardDataRef.current.basePrompt || "";
          const newText = text.slice(0, cur) + input + text.slice(cur);
          const currentWords = countWords(newText);
          if (currentWords <= 300) {
            const newCursor = cur + input.length;
            wizardDataRef.current.basePrompt = newText;
            wizardPromptCursorRef.current = newCursor;
            setWizardData((prev) => ({ ...prev, basePrompt: newText }));
            setWizardPromptCursor(newCursor);
            setFeedbackMsg(null);
          } else {
            setFeedbackMsg("Prompt exceeds 300 words limit.");
          }
          return;
        }
        return;
      }
    }

    // -------------------------------------------------------------------------
    // 1. EDIT PROMPT VIEW (handled by PromptEditor)
    // -------------------------------------------------------------------------
    if (view === "edit_prompt") {
      return;
    }

    // -------------------------------------------------------------------------
    // 2. TEXT INPUT BUFFER VIEW (API Key / File path)
    // -------------------------------------------------------------------------
    if (view === "input_text") {
      if (key.escape) {
        setTextBuffer("");
        setInputAction(null);
        if (activeRole) {
          setView("drilldown");
        } else {
          setView("wizard");
        }
        return;
      }
      if (key.return) {
        const val = textBuffer.trim();
        if (inputAction === "api_key") {
          if (activeRole) {
            if (val) {
              hook.assignModel(activeRole.slug, {
                type: "cloud",
                modelName: "Cloud Model",
                apiKey: val,
              });
              setFeedbackMsg("API key securely stored in vault.");
            }
            setView("drilldown");
          } else {
            // Coming from custom role wizard Step 3
            setWizardData((prev) => ({
              ...prev,
              apiKey: val,
              model: "Cloud Model",
              assignmentType: "cloud",
            }));
            setWizardStep(4);
            setView("wizard");
          }
          setTextBuffer("");
          setInputAction(null);
          return;
        } else if (inputAction === "custom_path") {
          setTempCustomPath(val);
          setTextBuffer("");
          setInputTitle("Enter friendly display name for this model:");
          setInputAction("custom_name");
          return;
        } else if (inputAction === "custom_name") {
          if (activeRole) {
            hook.assignModel(activeRole.slug, {
              type: "custom_path",
              modelName: val || "Custom Model",
              customPath: tempCustomPath,
            });
            setFeedbackMsg(`Assigned manual model: ${val || "Custom Model"}`);
            setView("drilldown");
          } else {
            // Coming from custom role wizard Step 3
            setWizardData((prev) => ({
              ...prev,
              model: val || "Custom Model",
              customPath: tempCustomPath,
              assignmentType: "custom_path",
            }));
            setWizardStep(4);
            setView("wizard");
          }
          setTextBuffer("");
          setInputAction(null);
          return;
        }
        setTextBuffer("");
        setInputAction(null);
        setView("roster");
        return;
      }
      if (key.backspace || key.delete) {
        setTextBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setTextBuffer((prev) => prev + input);
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 3. COLOR WHEEL & DARKNESS DIAL VIEW (Requirement 9 & 10)
    // -------------------------------------------------------------------------
    if (view === "color_palette" && activeRole) {
      // Robust vertical scrolling keys: [, ], PageUp, PageDown, Shift+Up/Down, Ctrl+Up/Down
      if (input === "[" || key.pageUp) {
        setColorScrollOffset((prev) => Math.max(0, Math.min(maxColorScrollRef.current, prev) - 2));
        return;
      }
      if (input === "]" || key.pageDown) {
        setColorScrollOffset((prev) => Math.min(maxColorScrollRef.current, prev + 2));
        return;
      }
      if ((key.shift || key.ctrl) && key.upArrow) {
        setColorScrollOffset((prev) => Math.max(0, Math.min(maxColorScrollRef.current, prev) - 1));
        return;
      }
      if ((key.shift || key.ctrl) && key.downArrow) {
        setColorScrollOffset((prev) => Math.min(maxColorScrollRef.current, prev + 1));
        return;
      }

      // Tab key: cycle focus between wheel, hex, rgb, hsl (with auto-scroll)
      if (key.tab) {
        if (key.shift) {
          setColorFocus((prev) => {
            if (prev === "wheel") {
              setColorScrollOffset(12);
              return "hsl";
            }
            if (prev === "hsl") return "rgb";
            if (prev === "rgb") return "hex";
            setColorScrollOffset(0);
            return "wheel";
          });
        } else {
          setColorFocus((prev) => {
            if (prev === "wheel") {
              setColorScrollOffset(12);
              return "hex";
            }
            if (prev === "hex") return "rgb";
            if (prev === "rgb") return "hsl";
            setColorScrollOffset(0);
            return "wheel";
          });
        }
        return;
      }

      // Escape key: exit input box back to wheel, or exit color picker back to drilldown
      if (key.escape) {
        if (colorFocus !== "wheel") {
          setColorScrollOffset(0);
          setColorFocus("wheel");
        } else {
          setView("drilldown");
        }
        return;
      }

      // FOCUS: WHEEL
      if (colorFocus === "wheel") {
        // w/s scrolling in wheel mode
        if (input === "w" || input === "W") {
          setColorScrollOffset((prev) => Math.max(0, Math.min(maxColorScrollRef.current, prev) - 2));
          return;
        }
        if (input === "s" || input === "S") {
          setColorScrollOffset((prev) => Math.min(maxColorScrollRef.current, prev + 2));
          return;
        }

        // Enter on wheel saves the color to role and exits to drilldown
        if (key.return) {
          const pickedHex = hslToHex(wheelHue, 100, wheelLightness);
          hook.setColor(activeRole.slug, pickedHex);
          setFeedbackMsg(`Role color for ${activeRole.name} updated to ${pickedHex.toUpperCase()}.`);
          setView("drilldown");
          return;
        }

        let nextHue = wheelHue;
        let nextLightness = wheelLightness;
        let changed = false;

        if (key.leftArrow) {
          nextHue = (wheelHue - 10 + 360) % 360;
          changed = true;
        } else if (key.rightArrow) {
          nextHue = (wheelHue + 10) % 360;
          changed = true;
        } else if (key.upArrow) {
          if (wheelLightness < 100) {
            nextLightness = Math.min(100, Math.round((wheelLightness + 10) / 10) * 10);
            changed = true;
          } else {
            // At top edge, Up arrow scrolls up
            setColorScrollOffset((prev) => Math.max(0, prev - 1));
          }
        } else if (key.downArrow) {
          if (wheelLightness > 0) {
            nextLightness = Math.max(0, Math.round((wheelLightness - 10) / 10) * 10);
            changed = true;
          } else {
            // At bottom edge, Down arrow scrolls down
            setColorScrollOffset((prev) => prev + 1);
          }
        }

        if (changed) {
          setWheelHue(nextHue);
          setWheelLightness(nextLightness);
          setHexInput(hslToHex(nextHue, 100, nextLightness).toUpperCase());
          const rgb = hslToRgb(nextHue, 100, nextLightness);
          setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
          setHslInput(`${nextHue}, 100, ${nextLightness}`);
        }
        return;
      }

      // FOCUS: HEX INPUT
      if (colorFocus === "hex") {
        if (key.return) {
          const parsed = parseHexToHsl(hexInput);
          if (parsed) {
            setWheelHue(parsed.hue);
            setWheelLightness(parsed.lightness);
            setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
            const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
            setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
            setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
          } else {
            setHexInput(hslToHex(wheelHue, 100, wheelLightness).toUpperCase());
          }
          setColorScrollOffset(0);
          setColorFocus("wheel");
          return;
        }
        if (key.backspace || key.delete) {
          const nextVal = hexInput.slice(0, -1);
          setHexInput(nextVal);
          const parsed = parseHexToHsl(nextVal);
          if (parsed) {
            setWheelHue(parsed.hue);
            setWheelLightness(parsed.lightness);
            const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
            setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
            setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
          }
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          if (/^[0-9a-fA-F#]$/.test(input) && hexInput.length < 7) {
            const nextVal = hexInput + input.toUpperCase();
            setHexInput(nextVal);
            const parsed = parseHexToHsl(nextVal);
            if (parsed) {
              setWheelHue(parsed.hue);
              setWheelLightness(parsed.lightness);
              const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
              setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
              setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
            }
          }
          return;
        }
        return;
      }

      // FOCUS: RGB INPUT
      if (colorFocus === "rgb") {
        if (key.return) {
          const parsed = parseRgbToHsl(rgbInput);
          if (parsed) {
            setWheelHue(parsed.hue);
            setWheelLightness(parsed.lightness);
            setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
            const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
            setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
            setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
          } else {
            const rgb = hslToRgb(wheelHue, 100, wheelLightness);
            setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
          }
          setColorScrollOffset(0);
          setColorFocus("wheel");
          return;
        }
        if (key.backspace || key.delete) {
          const nextVal = rgbInput.slice(0, -1);
          setRgbInput(nextVal);
          const parsed = parseRgbToHsl(nextVal);
          if (parsed) {
            setWheelHue(parsed.hue);
            setWheelLightness(parsed.lightness);
            setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
            setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
          }
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          if (/^[0-9,\s]$/.test(input) && rgbInput.length < 16) {
            const nextVal = rgbInput + input;
            setRgbInput(nextVal);
            const parsed = parseRgbToHsl(nextVal);
            if (parsed) {
              setWheelHue(parsed.hue);
              setWheelLightness(parsed.lightness);
              setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
              setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
            }
          }
          return;
        }
        return;
      }

      // FOCUS: HSL INPUT
      if (colorFocus === "hsl") {
        if (key.return) {
          const parsed = parseHslInput(hslInput);
          if (parsed) {
            setWheelHue(parsed.hue);
            setWheelLightness(parsed.lightness);
            setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
            const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
            setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
            setHslInput(`${parsed.hue}, 100, ${parsed.lightness}`);
          } else {
            setHslInput(`${wheelHue}, 100, ${wheelLightness}`);
          }
          setColorScrollOffset(0);
          setColorFocus("wheel");
          return;
        }
        if (key.backspace || key.delete) {
          const nextVal = hslInput.slice(0, -1);
          setHslInput(nextVal);
          const parsed = parseHslInput(nextVal);
          if (parsed) {
            setWheelHue(parsed.hue);
            setWheelLightness(parsed.lightness);
            setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
            const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
            setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
          }
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          if (/^[0-9,\s]$/.test(input) && hslInput.length < 16) {
            const nextVal = hslInput + input;
            setHslInput(nextVal);
            const parsed = parseHslInput(nextVal);
            if (parsed) {
              setWheelHue(parsed.hue);
              setWheelLightness(parsed.lightness);
              setHexInput(hslToHex(parsed.hue, 100, parsed.lightness).toUpperCase());
              const rgb = hslToRgb(parsed.hue, 100, parsed.lightness);
              setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
            }
          }
          return;
        }
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 4. SWITCH AGENT SUB-MENU (Requirement 7 & 11)
    // -------------------------------------------------------------------------
    if (view === "switch_agent" && activeRole) {
      // Sub-selection mode for Detected Models (Requirement 7)
      if (browsingDetectedModels) {
        if (key.escape) {
          setBrowsingDetectedModels(false);
          return;
        }
        if (key.upArrow) {
          setDetectedModelIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, hook.catalog.length - 1)));
          return;
        }
        if (key.downArrow) {
          setDetectedModelIndex((prev) => (prev < hook.catalog.length - 1 ? prev + 1 : 0));
          return;
        }
        if (key.return) {
          const pickedModel = hook.catalog[detectedModelIndex];
          if (pickedModel) {
            hook.assignModel(activeRole.slug, {
              type: "local",
              modelName: pickedModel.name,
            });
            setFeedbackMsg(`Assigned detected model: ${pickedModel.name}`);
          }
          setBrowsingDetectedModels(false);
          setView("drilldown");
          return;
        }
        return;
      }

      // Normal navigation among Switch Agent actions
      if (key.escape) {
        setView("drilldown");
        return;
      }
      if (key.upArrow) {
        setSwitchAgentIndex((prev) => (prev > 0 ? prev - 1 : switchAgentActions.length - 1));
        return;
      }
      if (key.downArrow) {
        setSwitchAgentIndex((prev) => (prev < switchAgentActions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.return) {
        const action = switchAgentActions[switchAgentIndex];
        if (!action) return;

        if (action.id === "detected_models") {
          // Requirement 7: Enter on Detected Models lets user browse them
          if (hook.catalog.length === 0) {
            setFeedbackMsg("No local models detected on disk. Pull a model or configure an API key.");
          } else {
            setBrowsingDetectedModels(true);
            setDetectedModelIndex(0);
          }
        } else if (action.id === "no_agent") {
          // Requirement 9 & 11: No Agent option
          hook.assignModel(activeRole.slug, {
            type: "local",
            modelName: "No Agent",
          });
          setFeedbackMsg(`Cleared agent assignment for ${activeRole.name}.`);
          setView("drilldown");
        } else if (action.id === "api_key") {
          setTextBuffer("");
          setInputTitle(`Enter Cloud API Key for ${activeRole.name} (Claude / OpenAI / Gemini):`);
          setInputAction("api_key");
          setView("input_text");
        } else if (action.id === "file_picker") {
          // Requirement 2: Try native OS file dialog first, fallback to prompt
          setFeedbackMsg("Opening system file picker...");
          tryOpenNativeFileDialog().then((pickedPath) => {
            if (pickedPath) {
              hook.assignModel(activeRole.slug, {
                type: "custom_path",
                modelName: pickedPath.split(/[\\/]/).pop() || "Custom Model",
                customPath: pickedPath,
              });
              setFeedbackMsg(`Assigned file: ${pickedPath}`);
              setView("drilldown");
            } else {
              setTextBuffer("");
              setInputTitle(`Enter model file path or endpoint URL for ${activeRole.name}:`);
              setInputAction("custom_path");
              setView("input_text");
            }
          });
        } else if (action.id === "rescan") {
          // Requirement 3 & 6: Rescan models ONLY here!
          setFeedbackMsg("Rescanning hardware & model files...");
          hook.rescanModels().then(() => {
            setFeedbackMsg("Model catalog rescan complete.");
          });
        } else if (action.id === "back") {
          setView("drilldown");
        }
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 5. ROLE DRILL-DOWN VIEW (Requirement 4, 7, 8)
    // -------------------------------------------------------------------------
    if (view === "drilldown" && activeRole) {
      if (key.escape) {
        setView("roster");
        return;
      }
      if (key.upArrow) {
        setDrilldownActionIndex((prev) => (prev > 0 ? prev - 1 : drillActions.length - 1));
        return;
      }
      if (key.downArrow) {
        setDrilldownActionIndex((prev) => (prev < drillActions.length - 1 ? prev + 1 : 0));
        return;
      }
      // Space toggles role on/off
      if (input === " ") {
        if (activeRole.isOrchestrator || activeRole.slug === "documenter") {
          setFeedbackMsg(`${activeRole.name} is essential and cannot be toggled off.`);
        } else {
          hook.toggleRole(activeRole.slug);
          setFeedbackMsg(`${activeRole.name} toggled ${activeRole.enabled ? "off" : "on"}.`);
        }
        return;
      }
      if (key.return) {
        const action = drillActions[drilldownActionIndex];
        if (!action) return;

        if (action.id === "switch_agent") {
          setSwitchAgentIndex(0);
          setView("switch_agent");
        } else if (action.id === "autonomy") {
          // Toggle between Off and Full
          const next = activeRole.autonomy === "full" ? "off" : "full";
          hook.setAutonomy(activeRole.slug, next);
          setFeedbackMsg(`Autonomy set to: ${next.toUpperCase()}`);
        } else if (action.id === "role_color") {
          const { hue, lightness } = parseColorToHsl(activeRole.color);
          setWheelHue(hue);
          setWheelLightness(lightness);
          setColorFocus("wheel");
          setHexInput(hslToHex(hue, 100, lightness).toUpperCase());
          const rgb = hslToRgb(hue, 100, lightness);
          setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
          setHslInput(`${hue}, 100, ${lightness}`);
          setView("color_palette");
        } else if (action.id === "edit_prompt") {
          setView("edit_prompt");
        } else if (action.id === "keep_loaded") {
          hook.setKeepLoaded(activeRole.slug, !activeRole.keepLoaded);
          setFeedbackMsg(`Keep loaded pin set to: ${!activeRole.keepLoaded ? "ON" : "OFF"}`);
        } else if (action.id === "delete_custom") {
          hook.deleteCustomRole(activeRole.slug);
          setFeedbackMsg(`Deleted custom role ${activeRole.name}.`);
          setView("roster");
        } else if (action.id === "back") {
          setView("roster");
        }
        return;
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 6. MAIN ROSTER VIEW (Requirement 3, 7, 10, 12)
    // -------------------------------------------------------------------------
    if (view === "roster") {
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow) {
        setRosterIndex((prev) => (prev > 0 ? prev - 1 : navItems.length - 1));
        return;
      }
      if (key.downArrow) {
        setRosterIndex((prev) => (prev < navItems.length - 1 ? prev + 1 : 0));
        return;
      }
      // Space toggles role on/off
      if (input === " ") {
        const item = navItems[rosterIndex];
        if (item && item.type === "role" && item.role) {
          if (item.role.isOrchestrator || item.role.slug === "documenter") {
            setFeedbackMsg(`${item.role.name} cannot be toggled off.`);
          } else {
            hook.toggleRole(item.role.slug);
            setFeedbackMsg(`${item.role.name} toggled ${item.role.enabled ? "off" : "on"}.`);
          }
        }
        return;
      }
      // Enter to drill down or add custom role
      if (key.return) {
        const item = navItems[rosterIndex];
        if (item) {
          if (item.type === "role" && item.role) {
            setSelectedRoleSlug(item.role.slug);
            setDrilldownActionIndex(0);
            setView("drilldown");
          } else if (item.type === "add_custom") {
            setWizardStep(1);
            setWizardNameCursor(0);
            wizardNameCursorRef.current = 0;
            setWizardFuncIndex(1); // default Builders
            setWizardAgentIndex(0); // default Detected Models
            setBrowsingWizardDetectedModels(false);
            setWizardDetectedModelIndex(0);
            setWizardData({
              name: "",
              roleFunction: "Builders",
              functionDescription: "",
              model: "No Agent",
              assignmentType: "local",
              basePrompt: "",
              prompt: "",
            });
            setFeedbackMsg(null);
            setView("wizard");
          }
        }
        return;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // RENDER: EDIT PROMPT SCREEN (PromptEditor)
  // ---------------------------------------------------------------------------
  if (view === "edit_prompt" && activeRole) {
    return (
      <PromptEditor
        title={activeRole.name}
        roleSlug={activeRole.slug}
        initialValue={activeRole.prompt || ""}
        roleColor={activeRole.color}
        terminalSize={{ columns: width, rows: height }}
        onSave={(saved) => {
          hook.setRolePrompt(activeRole.slug, saved);
          setFeedbackMsg(`Prompt saved for ${activeRole.name}.`);
          setView("drilldown");
        }}
        onClose={() => {
          setView("drilldown");
        }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: 5-STEP CUSTOM ROLE WIZARD (Claude Doc 21)
  // ---------------------------------------------------------------------------
  if (view === "wizard") {
    const steps = [
      { step: 1, title: "1. Name" },
      { step: 2, title: "2. Function" },
      { step: 3, title: "3. Agent" },
      { step: 4, title: "4. Prompt" },
    ];

    return (
      <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        {/* Header with Breadcrumb Indicator */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="cyan">
            Custom Role Wizard
          </Text>
          <Box flexDirection="row" gap={1} marginTop={0}>
            {steps.map((s, idx) => {
              const isCurrent = s.step === wizardStep;
              const isPassed = s.step < wizardStep;
              return (
                <Box key={s.step} flexDirection="row" gap={1}>
                  <Text
                    bold={isCurrent}
                    color={isCurrent ? "cyan" : isPassed ? "green" : "gray"}
                  >
                    [{s.title}]
                  </Text>
                  {idx < steps.length - 1 && <Text color="gray">→</Text>}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Step 1: Role Name (Single connected word only, e.g. batman or egg-head) */}
        {wizardStep === 1 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 1: Role Name
            </Text>
            <Text color="gray">
              Type a single-word role name without spaces (e.g. batman or egg-head).
            </Text>

            <Box flexDirection="column" marginY={1}>
              <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
              <Box flexDirection="row" paddingY={0}>
                <Text color="cyan" bold>&gt; </Text>
                {wizardData.name ? (
                  <Box flexDirection="row">
                    <Text bold color="white">{wizardData.name.slice(0, wizardNameCursor)}</Text>
                    <Text color="cyan" inverse>{wizardData.name[wizardNameCursor] || " "}</Text>
                    <Text bold color="white">{wizardData.name.slice(wizardNameCursor + 1)}</Text>
                  </Box>
                ) : (
                  <Box flexDirection="row">
                    <Text color="cyan" inverse>{" "}</Text>
                    <Text color="gray"> (e.g. batman or egg-head)</Text>
                  </Box>
                )}
              </Box>
              <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
            </Box>
          </Box>
        )}

        {/* Step 2: Role Function */}
        {wizardStep === 2 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 2: Role Function for "{wizardData.name}"
            </Text>
            <Text color="gray">
              The function sets where this role runs in the pipeline.
            </Text>

            <Box marginY={1} flexDirection="column">
              {WIZARD_FUNCTIONS.map((f, idx) => {
                const isSelected = idx === wizardFuncIndex;
                return (
                  <Box key={f.func} flexDirection="column" marginY={0}>
                    <Box flexDirection="row" gap={1}>
                      <Text color={isSelected ? "cyan" : "gray"}>
                        {isSelected ? "> " : "  "}
                      </Text>
                      <Box width={16}>
                        <Text bold={isSelected} color={isSelected ? "cyan" : "white"}>
                          {f.label}
                        </Text>
                      </Box>
                      <Text color={isSelected ? "white" : "gray"}>({f.desc})</Text>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Step 3: Assign Agent (With Detected Models sub-dropdown just like Switch Agent) */}
        {wizardStep === 3 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 3: Assign Agent for "{wizardData.name}"
            </Text>
            <Text color="gray">
              Select an AI model runtime, cloud API key, or custom file.
            </Text>

            <Box marginY={1} flexDirection="column">
              {wizardAgentActions.map((action, idx) => {
                const isSelected = idx === wizardAgentIndex;
                return (
                  <Box key={action.id} flexDirection="column" flexShrink={0}>
                    <Box flexDirection="row">
                      <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "> " : "  "}</Text>
                      <Text bold={isSelected} color={isSelected ? "cyan" : "gray"}>
                        {action.label}
                      </Text>
                    </Box>

                    {/* Detected Models Sub-dropdown: Only shown when action is hovered/selected (Item 1) */}
                    {action.id === "detected_models" && isSelected && (
                      <Box marginLeft={4} flexDirection="column" marginY={0}>
                        {hook.catalog.length === 0 ? (
                          <Text color="gray">(No local models detected on disk)</Text>
                        ) : browsingWizardDetectedModels ? (
                          <Box flexDirection="column">
                            <Text color="yellow">Select local model (Up/Down + Enter):</Text>
                            {hook.catalog.map((m, mIdx) => {
                              const isModelActive = mIdx === wizardDetectedModelIndex;
                              const fit = hook.getModelFitRating(m.name);
                              const fitStr = fit ? ` [${fit}]` : "";
                              return (
                                <Box key={m.id} marginLeft={2} flexShrink={0}>
                                  <Text color={isModelActive ? "green" : "gray"}>
                                    {isModelActive ? "> " : "  "}{m.name}{fitStr}
                                  </Text>
                                </Box>
                              );
                            })}
                          </Box>
                        ) : (
                          <Box flexDirection="column">
                            {hook.catalog.map((m) => {
                              const fit = hook.getModelFitRating(m.name);
                              const fitStr = fit ? ` [${fit}]` : "";
                              return (
                                <Box key={m.id} flexShrink={0}>
                                  <Text color="gray">
                                    • {m.name}{fitStr}
                                  </Text>
                                </Box>
                              );
                            })}
                            <Text color="cyan">(Press Enter on Detected Models to select one)</Text>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Step 4: Prompt (Unified with PromptEditor layout: exact cursor, '>' line indicator, scrollbar) */}
        {wizardStep === 4 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 4: Prompt for "{wizardData.name}" ({wizardData.roleFunction})
            </Text>
            <Text color="gray">
              Custom instructions or default duties. Words:{" "}
              <Text color={countWords(wizardData.basePrompt) > 300 ? "red" : "green"}>
                {countWords(wizardData.basePrompt)} / 300 words
              </Text>
            </Text>

            <Box flexDirection="column" marginY={1}>
              <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexDirection="column" flexGrow={1}>
                  {!wizardData.basePrompt ? (
                    <Box flexDirection="row">
                      <Text color="cyan" bold>{"> "}</Text>
                      <Text color="cyan" inverse>{" "}</Text>
                      <Text color="gray"> (type prompt instructions... Shift+Enter for new line)</Text>
                    </Box>
                  ) : (
                    visibleWizardLines.map((lineText, idx) => {
                      const actualLineIdx = wizardScrollOffset + idx;
                      const isLineActive = actualLineIdx === wizardCursorLine;

                      if (!isLineActive) {
                        return (
                          <Box key={idx} height={1} flexDirection="row">
                            <Text color="gray">  </Text>
                            <Text>{lineText || " "}</Text>
                          </Box>
                        );
                      }

                      const before = lineText.slice(0, wizardCursorCol);
                      const charAt = lineText[wizardCursorCol] || " ";
                      const after = lineText.slice(wizardCursorCol + 1);

                      return (
                        <Box key={idx} height={1} flexDirection="row">
                          <Text color="cyan" bold>{"> "}</Text>
                          <Text>{before}</Text>
                          <Text color="cyan" inverse>{charAt}</Text>
                          <Text>{after}</Text>
                        </Box>
                      );
                    })
                  )}
                </Box>

                {/* Right: Smooth web-like scrollbar rail for long prompts */}
                {wizardScrollbarRows.length > 0 && (
                  <Box flexDirection="column" width={1} height={Math.max(1, visibleWizardLines.length)} paddingLeft={1} flexShrink={0}>
                    {wizardScrollbarRows.map((row) => (
                      <Box key={row.index} height={1}>
                        {row.isThumb ? <Text color="cyan" bold>█</Text> : <Text> </Text>}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
              <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
            </Box>
          </Box>
        )}

        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>

        {/* Footer with contextual navigation shortcuts */}
        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
          <Text color="gray">
            {wizardStep === 1 && "Enter: next   Left/Right: move cursor   Esc: cancel"}
            {wizardStep === 2 && "Up/Down: select function   Enter: next   Esc: cancel"}
            {wizardStep === 3 && (browsingWizardDetectedModels
              ? "Up/Down: select model   Enter: choose   Esc: back"
              : "Up/Down: select action   Enter: choose   Esc: cancel")}
            {wizardStep === 4 && "Enter: create role   Shift+Enter: new line   Ctrl+R: reset   Ctrl+K: clear   Esc: cancel"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: TEXT INPUT SCREEN
  // ---------------------------------------------------------------------------
  if (view === "input_text") {
    return (
      <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        <Text bold color="cyan">
          {inputTitle}
        </Text>
        <Box flexDirection="column" marginY={1}>
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
          <Box flexDirection="row" paddingY={0}>
            <Text color="green">&gt; </Text>
            {textBuffer ? (
              <>
                <Text>{textBuffer}</Text>
                <Text color="cyan">█</Text>
              </>
            ) : (
              <>
                <Text color="cyan">█</Text>
                <Text color="gray"> (type here...)</Text>
              </>
            )}
          </Box>
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
        </Box>
        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>
        <Text color="gray">Press Enter to confirm, Esc to cancel</Text>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: COLOR WHEEL & DARKNESS DIAL SCREEN (Requirement 9 & 10)
  // ---------------------------------------------------------------------------
  if (view === "color_palette" && activeRole) {
    const currentColorHex = hslToHex(wheelHue, 100, wheelLightness);
    const rgb = hslToRgb(wheelHue, 100, wheelLightness);

    // Responsive wheel sizing based on terminal width and height
    const wheelSize: "large" | "medium" | "compact" =
      width >= 72 && height >= 24 ? "large" : width >= 56 && height >= 20 ? "medium" : "compact";
    const wheelRows = buildColorWheelRows(wheelHue, wheelLightness, wheelSize);

    // Dynamic dial levels adapting to wheel size
    const dialLevels =
      wheelSize === "compact"
        ? [100, 80, 60, 40, 20, 0]
        : [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

    const allRows: React.ReactNode[] = [];

    // Row 0: Role Name and Title
    allRows.push(
      <Box key="row-title" justifyContent="center" width="100%" paddingX={1}>
        <Text wrap="wrap">
          <Text bold color="white">Role Color Wheel: </Text>
          <Text bold color={currentColorHex}>{activeRole.name}</Text>
        </Text>
      </Box>
    );

    // Row 1: Original -> Selected
    allRows.push(
      <Box key="row-status" justifyContent="center" width="100%" paddingX={1}>
        <Text wrap="wrap">
          <Text color="gray">Original: </Text>
          <Text bold color={activeRole.color as any}>■ {activeRole.color}</Text>
          <Text color="gray">   →   Selected: </Text>
          <Text bold color={currentColorHex}>■ {currentColorHex.toUpperCase()}</Text>
        </Text>
      </Box>
    );

    // Row 2: Spacer
    allRows.push(
      <Box key="spacer-1" height={1} justifyContent="center" width="100%">
        <Text> </Text>
      </Box>
    );

    // Middle rows: Wheel + Dial (1 row per index)
    const wheelGap = width >= 72 ? 5 : width >= 56 ? 3 : 2;
    const dialWidth = wheelSize === "compact" ? 12 : 14;

    for (let rIdx = 0; rIdx < wheelRows.length; rIdx++) {
      let dialNode: React.ReactNode = <Text> </Text>;
      if (wheelSize === "compact") {
        if (rIdx === 0) {
          dialNode = <Text color="gray" bold>▲ Lighter</Text>;
        } else if (rIdx >= 1 && rIdx <= 6) {
          const lvl = dialLevels[rIdx - 1]!;
          const isCur = Math.abs(wheelLightness - lvl) <= 9;
          const lvlHex = hslToHex(wheelHue, 100, lvl);
          dialNode = (
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text color={lvlHex as any}>████</Text>
              <Text color={isCur ? "cyan" : "gray"} bold={isCur}>
                {String(lvl).padStart(3, " ")}%
              </Text>
              <Text color="cyan" bold>
                {isCur ? " ◀" : "  "}
              </Text>
            </Box>
          );
        } else if (rIdx === 7) {
          dialNode = <Text color="gray" bold>▼ Darker</Text>;
        }
      } else {
        if (rIdx === 0) {
          dialNode = <Text color="gray" bold>▲ Lighter</Text>;
        } else if (rIdx === wheelRows.length - 1) {
          dialNode = <Text color="gray" bold>▼ Darker</Text>;
        } else if (rIdx - 1 < dialLevels.length) {
          const lvl = dialLevels[rIdx - 1]!;
          const isCur = Math.abs(wheelLightness - lvl) <= 5;
          const lvlHex = hslToHex(wheelHue, 100, lvl);
          dialNode = (
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text color={lvlHex as any}>████</Text>
              <Text color={isCur ? "cyan" : "gray"} bold={isCur}>
                {String(lvl).padStart(3, " ")}%
              </Text>
              <Text color="cyan" bold>
                {isCur ? " ◀" : "  "}
              </Text>
            </Box>
          );
        }
      }

      allRows.push(
        <Box
          key={`wheel-row-${rIdx}`}
          flexDirection="row"
          gap={wheelGap}
          justifyContent="center"
          alignItems="center"
          width="100%"
        >
          <Box flexDirection="row" flexShrink={0}>
            {wheelRows[rIdx]!.map((chunk, cIdx) => (
              <Text key={cIdx} color={chunk.color ? (chunk.color as any) : undefined} bold={chunk.isPointer}>
                {chunk.text}
              </Text>
            ))}
          </Box>
          <Box width={dialWidth} flexShrink={0}>{dialNode}</Box>
        </Box>
      );
    }

    // Spacer
    allRows.push(
      <Box key="spacer-2" height={1} justifyContent="center" width="100%">
        <Text> </Text>
      </Box>
    );

    // Interactive Input Boxes:
    if (width >= 70) {
      allRows.push(
        <Box key="box-top" flexDirection="row" gap={2} justifyContent="center" width="100%" flexShrink={0}>
          <Text color={colorFocus === "hex" ? "cyan" : "gray"}>╭────────────────╮</Text>
          <Text color={colorFocus === "rgb" ? "cyan" : "gray"}>╭────────────────────╮</Text>
          <Text color={colorFocus === "hsl" ? "cyan" : "gray"}>╭────────────────────╮</Text>
        </Box>
      );
      allRows.push(
        <Box key="box-mid" flexDirection="row" gap={2} justifyContent="center" width="100%" flexShrink={0}>
          <Box flexDirection="row" width={18}>
            <Text color={colorFocus === "hex" ? "cyan" : "gray"}>│ </Text>
            <Text bold color={colorFocus === "hex" ? "cyan" : "gray"}>HEX: </Text>
            <Text color={colorFocus === "hex" ? "white" : "gray"}>{hexInput}</Text>
            {colorFocus === "hex" && <Text color="cyan">|</Text>}
            <Text color={colorFocus === "hex" ? "cyan" : "gray"}>{" ".repeat(Math.max(0, 7 - hexInput.length))} │</Text>
          </Box>
          <Box flexDirection="row" width={22}>
            <Text color={colorFocus === "rgb" ? "cyan" : "gray"}>│ </Text>
            <Text bold color={colorFocus === "rgb" ? "cyan" : "gray"}>RGB: </Text>
            <Text color={colorFocus === "rgb" ? "white" : "gray"}>{rgbInput}</Text>
            {colorFocus === "rgb" && <Text color="cyan">|</Text>}
            <Text color={colorFocus === "rgb" ? "cyan" : "gray"}>{" ".repeat(Math.max(0, 11 - rgbInput.length))} │</Text>
          </Box>
          <Box flexDirection="row" width={22}>
            <Text color={colorFocus === "hsl" ? "cyan" : "gray"}>│ </Text>
            <Text bold color={colorFocus === "hsl" ? "cyan" : "gray"}>HSL: </Text>
            <Text color={colorFocus === "hsl" ? "white" : "gray"}>{hslInput}</Text>
            {colorFocus === "hsl" && <Text color="cyan">|</Text>}
            <Text color={colorFocus === "hsl" ? "cyan" : "gray"}>{" ".repeat(Math.max(0, 11 - hslInput.length))} │</Text>
          </Box>
        </Box>
      );
      allRows.push(
        <Box key="box-bot" flexDirection="row" gap={2} justifyContent="center" width="100%" flexShrink={0}>
          <Text color={colorFocus === "hex" ? "cyan" : "gray"}>╰────────────────╯</Text>
          <Text color={colorFocus === "rgb" ? "cyan" : "gray"}>╰────────────────────╯</Text>
          <Text color={colorFocus === "hsl" ? "cyan" : "gray"}>╰────────────────────╯</Text>
        </Box>
      );
    } else if (width >= 48) {
      // 2-row rounded layout
      allRows.push(
        <Box key="box-compact-1" flexDirection="row" gap={2} justifyContent="center" width="100%" flexShrink={0}>
          <Box borderStyle="round" borderColor={colorFocus === "hex" ? "cyan" : "gray"} paddingX={1}>
            <Text bold color={colorFocus === "hex" ? "cyan" : "gray"}>HEX: </Text>
            <Text color={colorFocus === "hex" ? "white" : "gray"}>{hexInput}</Text>
            {colorFocus === "hex" && <Text color="cyan">|</Text>}
          </Box>
          <Box borderStyle="round" borderColor={colorFocus === "rgb" ? "cyan" : "gray"} paddingX={1}>
            <Text bold color={colorFocus === "rgb" ? "cyan" : "gray"}>RGB: </Text>
            <Text color={colorFocus === "rgb" ? "white" : "gray"}>{rgbInput}</Text>
            {colorFocus === "rgb" && <Text color="cyan">|</Text>}
          </Box>
        </Box>
      );
      allRows.push(
        <Box key="box-compact-2" flexDirection="row" justifyContent="center" width="100%" flexShrink={0}>
          <Box borderStyle="round" borderColor={colorFocus === "hsl" ? "cyan" : "gray"} paddingX={1}>
            <Text bold color={colorFocus === "hsl" ? "cyan" : "gray"}>HSL: </Text>
            <Text color={colorFocus === "hsl" ? "white" : "gray"}>{hslInput}</Text>
            {colorFocus === "hsl" && <Text color="cyan">|</Text>}
          </Box>
        </Box>
      );
    } else {
      // Ultra-narrow: 1 box per line
      allRows.push(
        <Box key="box-narrow-hex" flexDirection="row" justifyContent="center" width="100%" flexShrink={0}>
          <Box borderStyle="round" borderColor={colorFocus === "hex" ? "cyan" : "gray"} paddingX={1}>
            <Text bold color={colorFocus === "hex" ? "cyan" : "gray"}>HEX: </Text>
            <Text color={colorFocus === "hex" ? "white" : "gray"}>{hexInput}</Text>
            {colorFocus === "hex" && <Text color="cyan">|</Text>}
          </Box>
        </Box>
      );
      allRows.push(
        <Box key="box-narrow-rgb" flexDirection="row" justifyContent="center" width="100%" flexShrink={0}>
          <Box borderStyle="round" borderColor={colorFocus === "rgb" ? "cyan" : "gray"} paddingX={1}>
            <Text bold color={colorFocus === "rgb" ? "cyan" : "gray"}>RGB: </Text>
            <Text color={colorFocus === "rgb" ? "white" : "gray"}>{rgbInput}</Text>
            {colorFocus === "rgb" && <Text color="cyan">|</Text>}
          </Box>
        </Box>
      );
      allRows.push(
        <Box key="box-narrow-hsl" flexDirection="row" justifyContent="center" width="100%" flexShrink={0}>
          <Box borderStyle="round" borderColor={colorFocus === "hsl" ? "cyan" : "gray"} paddingX={1}>
            <Text bold color={colorFocus === "hsl" ? "cyan" : "gray"}>HSL: </Text>
            <Text color={colorFocus === "hsl" ? "white" : "gray"}>{hslInput}</Text>
            {colorFocus === "hsl" && <Text color="cyan">|</Text>}
          </Box>
        </Box>
      );
    }

    // Spacer
    allRows.push(
      <Box key="spacer-3" height={1} justifyContent="center" width="100%">
        <Text> </Text>
      </Box>
    );

    // Format Note
    allRows.push(
      <Box key="format-note" justifyContent="center" width="100%" paddingX={1}>
        <Text color="gray" wrap="wrap">
          {width < 64
            ? "Note: HEX (#RRGGBB) │ RGB (0-255) │ HSL (0-360, 0-100)"
            : "Note: Format as HEX (#RRGGBB), RGB (R, G, B: 0-255), HSL (H, S, L: 0-360, 0-100, 0-100)"}
        </Text>
      </Box>
    );

    // Divider Line 1
    const dividerLength = Math.max(10, Math.min(width - 6, width >= 72 ? 66 : 46));
    allRows.push(
      <Box key="divider-1" width="100%" justifyContent="center">
        <Text color="gray">{"─".repeat(dividerLength)}</Text>
      </Box>
    );

    // Live Preview
    allRows.push(
      <Box key="live-preview" justifyContent="center" width="100%" paddingX={1}>
        <Text wrap="wrap">
          <Text bold color="gray">Live Chat Preview: </Text>
          <Text bold color={currentColorHex}>[{activeRole.name}]</Text>
          <Text color="white">
            {width < 64 ? " Writing LoginForm.tsx" : " Writing LoginForm.tsx (type contracts verified)"}
          </Text>
        </Text>
      </Box>
    );

    // Divider Line 2
    allRows.push(
      <Box key="divider-2" width="100%" justifyContent="center">
        <Text color="gray">{"─".repeat(dividerLength)}</Text>
      </Box>
    );

    // Spacer
    allRows.push(
      <Box key="spacer-4" height={1} justifyContent="center" width="100%">
        <Text> </Text>
      </Box>
    );

    // Footer Shortcuts & Scroll calculation
    const availableHeight = height;
    const totalColorRows = allRows.length + 1;
    const needsScroll = totalColorRows > availableHeight;
    const maxScroll = Math.max(0, totalColorRows - availableHeight);
    maxColorScrollRef.current = maxScroll;
    const clampedOffset = Math.max(0, Math.min(maxScroll, colorScrollOffset));

    allRows.push(
      <Box key="footer-shortcuts" justifyContent="center" width="100%" paddingX={1}>
        <Text color="gray" wrap="wrap">
          {colorFocus === "wheel"
            ? (width < 64
                ? "Arrows: dial/wheel │ Scroll: mouse wheel / PgUp / PgDn │ Tab: inputs │ Enter: save"
                : (needsScroll
                    ? "Left/Right: wheel   Up/Down: dial   Scroll: mouse wheel / PgUp / PgDn   Tab: inputs   Enter: save   Esc: cancel"
                    : "Left/Right: rotate wheel   Up/Down: darkness   Tab: edit inputs   Enter: save   Esc: cancel"))
            : "Type value   Enter: apply to wheel   Tab: next field   Esc: wheel"}
        </Text>
      </Box>
    );

    const visibleRows = needsScroll
      ? allRows.slice(clampedOffset, clampedOffset + availableHeight)
      : allRows;

    const scrollbarRows: { index: number; isThumb: boolean }[] = [];
    if (needsScroll) {
      const scrollbarHeight = availableHeight;
      const thumbHeight = Math.max(
        1,
        Math.min(scrollbarHeight - 1, Math.round((availableHeight / allRows.length) * scrollbarHeight))
      );
      const scrollRatio = maxScroll > 0 ? clampedOffset / maxScroll : 0;
      const maxThumbTop = scrollbarHeight - thumbHeight;
      const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

      for (let i = 0; i < scrollbarHeight; i++) {
        const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
        scrollbarRows.push({ index: i, isThumb });
      }
    }

    return (
      <Box flexDirection="row" width={width} height={availableHeight} paddingX={1} paddingY={0}>
        <Box flexDirection="column" width={needsScroll ? width - 4 : width - 2} alignItems="center">
          {visibleRows}
        </Box>
        {needsScroll && (
          <Box flexDirection="column" width={1} height={availableHeight} paddingLeft={1} flexShrink={0}>
            {scrollbarRows.map((row) => (
              <Box key={row.index} height={1}>
                {row.isThumb ? <Text color="cyan" bold>█</Text> : <Text> </Text>}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: SWITCH AGENT SUB-MENU (Requirement 7 & 11)
  // ---------------------------------------------------------------------------
  if (view === "switch_agent" && activeRole) {
    const recommendations = getRecommendationsForRole(activeRole, hook.hardware);
    const localModels = hook.catalog;

    return (
      <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        <Text bold color="cyan">
          Switch Agent for {activeRole.name}
        </Text>
        <Text color="gray">Choose a local brain model, cloud API key, or manual file.</Text>

        {/* Dedicated Compact Recommendation Box (Requirement 3 & 7) */}
        <Box marginTop={height < 24 ? 0 : 1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
          <Text bold color="white">
            Recommended for {activeRole.name} (Hardware: {hook.hardware ? `${Math.round(hook.hardware.totalRamBytes / (1024 * 1024 * 1024))}GB RAM` : "Auto"}):
          </Text>
          {recommendations.slice(0, height < 24 ? 1 : 2).map((rec, idx) => (
            <Box key={idx} flexDirection="column" flexShrink={0} marginTop={idx > 0 ? 1 : 0}>
              <Text color="cyan">• {rec.agent}: <Text color="gray">{rec.reason}</Text></Text>
              <Box marginLeft={2} flexShrink={0}>
                <Text color="yellow">• cmd: {rec.pullCmd}</Text>
              </Box>
            </Box>
          ))}
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
        </Box>

        {/* Switch Agent Actions with flexShrink={0} so they never collapse (Item 9) */}
        <Box marginTop={1} flexDirection="column">
          <Text bold color="white">
            Actions:
          </Text>
          {switchAgentActions.map((action, idx) => {
            const isSelected = idx === switchAgentIndex;

            return (
              <Box key={action.id} flexDirection="column" flexShrink={0}>
                <Box flexDirection="row" height={1} flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "> " : "  "}</Text>
                  <Text bold={isSelected} color={isSelected ? "cyan" : "gray"}>
                    {action.label}
                  </Text>
                </Box>

                {/* Detected Models Sub-dropdown: Only shown when action is hovered/selected (Requirement 7) */}
                {action.id === "detected_models" && isSelected && (
                  <Box marginLeft={4} flexDirection="column" marginY={0}>
                    {localModels.length === 0 ? (
                      <Text color="gray">(No local models detected on disk)</Text>
                    ) : browsingDetectedModels ? (
                      <Box flexDirection="column">
                        <Text color="yellow">Select local model (Up/Down + Enter):</Text>
                        {localModels.slice(0, 4).map((m, mIdx) => {
                          const isModelActive = mIdx === detectedModelIndex;
                          const fit = hook.getModelFitRating(m.name);
                          const fitStr = fit ? ` [${fit}]` : "";
                          return (
                            <Box key={m.id} marginLeft={2} flexShrink={0} height={1}>
                              <Text color={isModelActive ? "green" : "gray"}>
                                {isModelActive ? "> " : "  "}{m.name}{fitStr}
                              </Text>
                            </Box>
                          );
                        })}
                      </Box>
                    ) : (
                      <Box flexDirection="column">
                        {localModels.slice(0, 3).map((m) => {
                          const fit = hook.getModelFitRating(m.name);
                          const fitStr = fit ? ` [${fit}]` : "";
                          return (
                            <Box key={m.id} flexShrink={0}>
                              <Text color="gray">
                                • {m.name}{fitStr}
                              </Text>
                            </Box>
                          );
                        })}
                        <Text color="cyan">(Press Enter on Detected Models to select one)</Text>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Dedicated 1-line feedback slot so actions never collapse when feedback appears (Item 9) */}
        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>

        <Box marginTop={1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
          <Text color="gray">
            {browsingDetectedModels
              ? "Up/Down: select model   Enter: assign model   Esc: back to actions"
              : "Up/Down: navigate actions   Enter: select   Esc: back to role details"}
          </Text>
        </Box>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: ROLE DRILLDOWN SCREEN (Requirement 4, 7, 8)
  // ---------------------------------------------------------------------------
  if (view === "drilldown" && activeRole) {
    // Abbreviated prompt snippet across three lines + ellipsis (Requirement 5)
    const rawPrompt = activeRole.prompt || "No prompt set";
    const promptClean = rawPrompt.replace(/\s+/g, " ").trim();
    const lineLen = Math.max(30, width - 12);
    const line1 = promptClean.slice(0, lineLen);
    const line2 = promptClean.length > lineLen ? promptClean.slice(lineLen, lineLen * 2) : "";
    const line3 = promptClean.length > lineLen * 2 ? promptClean.slice(lineLen * 2, lineLen * 3) : "";

    return (
      <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        {/* Header row */}
        <Box flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <Box flexDirection="row" gap={1}>
            <Text bold color={activeRole.color as any}>
              {activeRole.name}
            </Text>
            <Text color="gray">│</Text>
            <Text color="gray">Category: {activeRole.roleFunction}</Text>
          </Box>
          <Text color="gray">
            Status: <Text color={activeRole.enabled ? "green" : "gray"}>[{activeRole.enabled ? "on" : "off"}]</Text>
            {activeRole.isOrchestrator || activeRole.slug === "documenter" ? " (always on)" : " (space to toggle)"}
          </Text>
        </Box>
        <Box marginTop={0} flexShrink={0}>
          <Text color="gray">{activeRole.description}</Text>
        </Box>

        {/* Manager critical warning */}
        {activeRole.slug === "manager" && (
          <Box marginY={height < 24 ? 0 : 1} flexDirection="column" flexShrink={0}>
            <Text color="yellow">! Warning: Manager is the conductor of Vecta. Changing its model risks instability.</Text>
          </Box>
        )}

        {/* Current agent display */}
        <Box marginTop={height < 24 ? 0 : 1} flexDirection="column" flexShrink={0}>
          <Text bold>
            Current agent:{" "}
            <Text color="cyan">
              {activeRole.model || "No Agent"} {getFitBadge(activeRole)}
            </Text>
          </Text>
          {activeRole.customPath && <Text color="gray">Path: {activeRole.customPath}</Text>}
        </Box>

        {/* Prompt snippet: responsive to terminal height (Requirement 5) */}
        <Box marginTop={height < 24 ? 0 : 1} flexDirection="column" flexShrink={0}>
          <Text bold>Prompt (300 words max):</Text>
          <Box marginLeft={2} marginTop={0}>
            <Text color="gray">"{line1}"</Text>
          </Box>
          {height >= 24 && line2 ? (
            <Box marginLeft={2} marginTop={0}>
              <Text color="gray">"{line2}"</Text>
            </Box>
          ) : null}
          {height >= 26 && line3 ? (
            <Box marginLeft={2} marginTop={0}>
              <Text color="gray">"{line3}"</Text>
            </Box>
          ) : null}
          <Box marginLeft={2} marginTop={0}>
            <Text color="gray">...</Text>
          </Box>
        </Box>

        {/* Actions list with windowed scrolling if terminal height is tight (Item 9) */}
        {(() => {
          const maxVisibleActions = Math.max(3, height - (activeRole.slug === "manager" ? 17 : 14));
          let actionsStart = 0;
          if (drillActions.length > maxVisibleActions) {
            actionsStart = Math.max(
              0,
              Math.min(
                drilldownActionIndex - Math.floor(maxVisibleActions / 2),
                drillActions.length - maxVisibleActions
              )
            );
          }
          const visibleActions = drillActions.length > maxVisibleActions
            ? drillActions.slice(actionsStart, actionsStart + maxVisibleActions)
            : drillActions;

          return (
            <Box marginTop={height < 24 ? 0 : 1} flexDirection="column">
              <Text bold color="white">
                Actions:
              </Text>
              {visibleActions.map((action) => {
                const globalIdx = drillActions.findIndex((a) => a.id === action.id);
                const isSelected = globalIdx === drilldownActionIndex;

                return (
                  <Box key={action.id} flexDirection="column" flexShrink={0}>
                    <Box flexDirection="row" height={1} flexShrink={0}>
                      <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "> " : "  "}</Text>
                      <Text bold={isSelected} color={isSelected ? "cyan" : "gray"}>
                        {action.label}
                      </Text>
                    </Box>
                    {/* Indented explanation right underneath line when hovered */}
                    {isSelected && action.explanation && (
                      <Box marginLeft={4} flexShrink={0}>
                        <Text color="magenta">{"-> "} {action.explanation}</Text>
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          );
        })()}

        {/* Dedicated 1-line feedback slot so actions never collapse when feedback appears (Item 9) */}
        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>

        <Box marginTop={height < 24 ? 0 : 1} flexDirection="column" flexShrink={0}>
          <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
          <Text color="gray">Up/Down: navigate   Enter: select action   Space: toggle status   Esc: back to roles</Text>
        </Box>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: MAIN ROSTER SCREEN (Requirement 3, 7, 10, 12 - with windowed scrolling Item 8)
  // ---------------------------------------------------------------------------
  interface RosterRow {
    key: string;
    isHeader?: boolean;
    headerTitle?: string;
    navIndex?: number;
    role?: RoleDefinition;
    isAddCustom?: boolean;
  }

  const allRosterRows: RosterRow[] = [];
  allRosterRows.push({ key: "h-orch", isHeader: true, headerTitle: "Orchestrators (always on)" });
  orchestrators.forEach((r) => {
    const idx = navItems.findIndex((it) => it.type === "role" && it.role?.slug === r.slug);
    allRosterRows.push({ key: `r-${r.slug}`, navIndex: idx, role: r });
  });

  allRosterRows.push({ key: "h-bld", isHeader: true, headerTitle: "Builders" });
  builders.forEach((r) => {
    const idx = navItems.findIndex((it) => it.type === "role" && it.role?.slug === r.slug);
    allRosterRows.push({ key: `r-${r.slug}`, navIndex: idx, role: r });
  });

  allRosterRows.push({ key: "h-chk", isHeader: true, headerTitle: "Checkers" });
  checkers.forEach((r) => {
    const idx = navItems.findIndex((it) => it.type === "role" && it.role?.slug === r.slug);
    allRosterRows.push({ key: `r-${r.slug}`, navIndex: idx, role: r });
  });

  allRosterRows.push({ key: "h-fin", isHeader: true, headerTitle: "Finalizers" });
  finalizers.forEach((r) => {
    const idx = navItems.findIndex((it) => it.type === "role" && it.role?.slug === r.slug);
    allRosterRows.push({ key: `r-${r.slug}`, navIndex: idx, role: r });
  });

  if (customRoles.length > 0) {
    allRosterRows.push({ key: "h-cust", isHeader: true, headerTitle: "Custom" });
    customRoles.forEach((r) => {
      const idx = navItems.findIndex((it) => it.type === "role" && it.role?.slug === r.slug);
      allRosterRows.push({ key: `r-${r.slug}`, navIndex: idx, role: r });
    });
  }

  const addIdx = navItems.findIndex((it) => it.type === "add_custom");
  allRosterRows.push({ key: "r-add-custom", navIndex: addIdx, isAddCustom: true });

  const totalRows = allRosterRows.length;
  // Reserve lines for header (2), feedback (1), and footer (2)
  const maxVisibleRosterRows = Math.max(8, height - 5);
  const activeRowIndex = allRosterRows.findIndex((row) => row.navIndex === rosterIndex);
  const clampedActiveRow = activeRowIndex >= 0 ? activeRowIndex : 0;

  let rosterStart = 0;
  if (totalRows > maxVisibleRosterRows) {
    rosterStart = Math.max(0, Math.min(clampedActiveRow - Math.floor(maxVisibleRosterRows / 2), totalRows - maxVisibleRosterRows));
  }
  const visibleRosterRows = totalRows > maxVisibleRosterRows
    ? allRosterRows.slice(rosterStart, rosterStart + maxVisibleRosterRows)
    : allRosterRows;

  // Smooth web scrollbar for main roster
  const scrollbarRows: { index: number; isThumb: boolean }[] = [];
  if (totalRows > maxVisibleRosterRows) {
    const scrollbarHeight = maxVisibleRosterRows;
    const thumbHeight = Math.max(
      1,
      Math.min(scrollbarHeight - 1, Math.round((maxVisibleRosterRows / totalRows) * scrollbarHeight))
    );
    const maxScroll = totalRows - maxVisibleRosterRows;
    const scrollRatio = maxScroll > 0 ? rosterStart / maxScroll : 0;
    const maxThumbTop = scrollbarHeight - thumbHeight;
    const thumbTop = Math.min(maxThumbTop, Math.max(0, Math.round(scrollRatio * maxThumbTop)));

    for (let i = 0; i < scrollbarHeight; i++) {
      const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
      scrollbarRows.push({ index: i, isThumb });
    }
  }

  return (
    <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
      {/* Title bar (Clean, borderless per Item 4) */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1} flexShrink={0}>
        <Text bold color="cyan">
          Vecta Roles
        </Text>
        {hook.activeBackgroundServers.length > 0 && (
          <Text color="blue">[Server active: {hook.activeBackgroundServers.join(", ")}]</Text>
        )}
      </Box>

      {/* Scrollable roster rows with smooth web scrollbar rail on right */}
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="column" flexGrow={1}>
          {visibleRosterRows.map((row) => {
            if (row.isHeader) {
              return (
                <Box key={row.key} height={1} flexShrink={0} marginTop={0}>
                  <Text bold color="white">{row.headerTitle}</Text>
                </Box>
              );
            }

            const isSelected = row.navIndex === rosterIndex;

            if (row.isAddCustom) {
              return (
                <Box key={row.key} marginLeft={2} height={1} flexShrink={0}>
                  <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "> " : "  "}</Text>
                  <Text bold={isSelected} color={isSelected ? "cyan" : "gray"}>
                    + Add custom role
                  </Text>
                </Box>
              );
            }

            const r = row.role!;
            return (
              <Box key={row.key} marginLeft={2} flexDirection="row" height={1} flexShrink={0}>
                <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "> " : "  "}</Text>
                <Text color={r.enabled ? "green" : "gray"}>[{r.enabled ? "on" : "off"}] </Text>
                <Box width={26} flexShrink={0}>
                  <Text bold={isSelected} color={r.color as any}>
                    {r.name}
                  </Text>
                </Box>
                <Text color="gray">
                  {r.model || (r.isOrchestrator ? "Vecta Default" : "No Agent")} {getFitBadge(r)}
                </Text>
                {r.roleFunction === "Checkers" && r.autonomy && <Text color="magenta"> [{r.autonomy.toUpperCase()}]</Text>}
              </Box>
            );
          })}
        </Box>

        {/* Right: Smooth web-like scrollbar rail for roster */}
        {scrollbarRows.length > 0 && (
          <Box flexDirection="column" width={1} height={maxVisibleRosterRows} paddingLeft={1} flexShrink={0}>
            {scrollbarRows.map((row: { index: number; isThumb: boolean }) => (
              <Box key={row.index} height={1}>
                {row.isThumb ? (
                  <Text color="cyan" bold>█</Text>
                ) : (
                  <Text> </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Dedicated 1-line feedback slot */}
      <Box height={1} marginY={0} flexShrink={0}>
        {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
      </Box>

      {/* Footer Status Bar */}
      <Box marginTop={1} flexDirection="column" flexShrink={0}>
        <Text color="gray">{"─".repeat(Math.max(10, width - 4))}</Text>
        <Text color="gray">
          Up/Down: navigate   Space: toggle [on]/[off]   Enter: select role   Esc: exit to chat
        </Text>
      </Box>
    </Box>
  );
};
