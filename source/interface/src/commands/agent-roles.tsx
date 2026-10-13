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

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useRoles, countWords, type UseRolesReturn } from "../hooks/useRoles.js";
import { type RoleDefinition, type RoleFunction, stripLayer1Rules } from "../../../roles/base.js";
import type { HardwareInfo } from "../types/bridge.js";

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

  const width = Math.max(70, terminalSize?.columns || process.stdout.columns || 80);
  const height = Math.max(16, (terminalSize?.rows || process.stdout.rows || 24) - 1);

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

  // Edit prompt state with scrolling support (Requirement 4 & 5)
  const [promptBuffer, setPromptBuffer] = useState("");
  const [promptScrollOffset, setPromptScrollOffset] = useState(0);
  const [promptLineCursor, setPromptLineCursor] = useState(0);

  // Generic text input buffer for API key or custom path
  const [textBuffer, setTextBuffer] = useState("");
  const [inputTitle, setInputTitle] = useState("");
  const [inputAction, setInputAction] = useState<"api_key" | "custom_path" | "custom_name" | "wizard_name" | "wizard_desc" | null>(null);
  const [tempCustomPath, setTempCustomPath] = useState("");

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Clear feedback message whenever view transitions so it never crosses over to another page
  useEffect(() => {
    setFeedbackMsg(null);
  }, [view]);

  // Auto-dismiss feedback message after 3.5 seconds so it doesn't linger indefinitely
  useEffect(() => {
    if (!feedbackMsg) return;
    const timer = setTimeout(() => {
      setFeedbackMsg(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [feedbackMsg]);

  // 5-Step Wizard state for custom roles (Claude Doc 21)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
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
    customInstructions: string;
  }>({
    name: "",
    roleFunction: "Builders",
    functionDescription: "",
    model: "No Agent",
    assignmentType: "local",
    basePrompt: "",
    customInstructions: "",
  });

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
    { id: "edit_prompt", label: `Edit prompt for ${activeRole?.name || "role"}` },
    { id: "keep_loaded", label: `Keep model loaded: [${activeRole?.keepLoaded ? "on" : "off"}] (Press Enter to toggle)` },
    ...(activeRole?.isCustom ? [{ id: "delete_custom" as const, label: `Delete custom role ${activeRole.name}` }] : []),
    { id: "back", label: "Back to roles (Esc)" },
  ];

  // Keyboard navigation
  useInput((input, key) => {
    // -------------------------------------------------------------------------
    // 0. 5-STEP CUSTOM ROLE WIZARD (Claude Doc 21 - Steps 1-5 with Left/Right navigation)
    // -------------------------------------------------------------------------
    if (view === "wizard") {
      // Escape at any step exits wizard cleanly back to roster
      if (key.escape) {
        setView("roster");
        setFeedbackMsg(null);
        return;
      }

      // Step 1: Role Name
      if (wizardStep === 1) {
        if (key.return || key.rightArrow) {
          const trimmed = wizardData.name.trim();
          if (!trimmed) {
            setFeedbackMsg("Please type a name for the role.");
            return;
          }
          if (!wizardData.basePrompt) {
            setWizardData((prev) => ({
              ...prev,
              basePrompt: `You are a ${trimmed}. You ${getDefaultDutyForFunction(prev.roleFunction)}`,
            }));
          }
          setFeedbackMsg(null);
          setWizardStep(2);
          return;
        }
        if (key.backspace || key.delete) {
          setWizardData((prev) => ({ ...prev, name: prev.name.slice(0, -1) }));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setWizardData((prev) => ({ ...prev, name: prev.name + input }));
          return;
        }
        return;
      }

      // Step 2: Role Function (Left arrow -> Name, Right arrow/Enter -> Agent)
      if (wizardStep === 2) {
        if (key.leftArrow) {
          setWizardStep(1);
          return;
        }
        if (key.upArrow) {
          setWizardFuncIndex((prev) => (prev > 0 ? prev - 1 : WIZARD_FUNCTIONS.length - 1));
          return;
        }
        if (key.downArrow) {
          setWizardFuncIndex((prev) => (prev < WIZARD_FUNCTIONS.length - 1 ? prev + 1 : 0));
          return;
        }
        if (key.return || key.rightArrow) {
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

      // Step 3: Assign Agent (With Detected Models sub-dropdown just like Switch Agent)
      if (wizardStep === 3) {
        if (browsingWizardDetectedModels) {
          if (key.escape || key.leftArrow) {
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
          if (key.return || key.rightArrow) {
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

        if (key.leftArrow) {
          setWizardStep(2);
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
        if (key.return || key.rightArrow) {
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

      // Step 4: Suggested Base Prompt (Left arrow -> Agent, Right arrow/Enter -> Custom Instructions)
      if (wizardStep === 4) {
        if (key.leftArrow) {
          setWizardStep(3);
          return;
        }
        if (key.ctrl && (input === "r" || input === "R")) {
          setWizardData((prev) => ({
            ...prev,
            basePrompt: `You are a ${prev.name || "Custom Role"}. You ${getDefaultDutyForFunction(prev.roleFunction)}`,
          }));
          setFeedbackMsg("Prompt reset to suggested default.");
          return;
        }
        if (key.ctrl && (input === "k" || input === "K")) {
          setWizardData((prev) => ({ ...prev, basePrompt: "" }));
          setFeedbackMsg("Prompt cleared.");
          return;
        }
        if (key.return || key.rightArrow) {
          setWizardStep(5);
          return;
        }
        if (key.backspace || key.delete) {
          setWizardData((prev) => ({ ...prev, basePrompt: prev.basePrompt.slice(0, -1) }));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setWizardData((prev) => ({ ...prev, basePrompt: prev.basePrompt + input }));
          return;
        }
        return;
      }

      // Step 5: Custom Instructions (300 words max, optional)
      if (wizardStep === 5) {
        if (key.leftArrow) {
          setWizardStep(4);
          return;
        }
        if (key.ctrl && (input === "k" || input === "K")) {
          setWizardData((prev) => ({ ...prev, customInstructions: "" }));
          setFeedbackMsg("Instructions cleared.");
          return;
        }
        if (key.return) {
          // Complete wizard and add custom role
          hook.addCustomRole({
            name: wizardData.name.trim(),
            roleFunction: wizardData.roleFunction,
            description: wizardData.functionDescription || `${wizardData.name.trim()} custom role`,
            model: wizardData.model || "No Agent",
            assignmentType: wizardData.assignmentType,
            customPath: wizardData.customPath,
            prompt: wizardData.basePrompt,
            customInstructions: wizardData.customInstructions,
          });
          setFeedbackMsg(`Successfully created custom role "${wizardData.name.trim()}".`);
          setView("roster");
          return;
        }
        if (key.backspace || key.delete) {
          setWizardData((prev) => ({ ...prev, customInstructions: prev.customInstructions.slice(0, -1) }));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          const currentWords = countWords(wizardData.customInstructions + input);
          if (currentWords <= 300) {
            setWizardData((prev) => ({ ...prev, customInstructions: prev.customInstructions + input }));
          } else {
            setFeedbackMsg("Custom instructions exceed 300 words limit.");
          }
          return;
        }
        return;
      }
    }

    // -------------------------------------------------------------------------
    // 1. EDIT PROMPT VIEW (Requirement 4 & 5 - smooth scrolling & Ctrl+K)
    // -------------------------------------------------------------------------
    if (view === "edit_prompt" && activeRole) {
      if (key.escape) {
        setView("drilldown");
        return;
      }
      // Smooth Up/Down arrow scrolling and active line cursor tracking (Item 5)
      if (key.upArrow) {
        setPromptLineCursor((prev) => {
          const next = Math.max(0, prev - 1);
          setPromptScrollOffset((curOffset) => (next < curOffset ? next : curOffset));
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setPromptLineCursor((prev) => {
          const next = prev + 1;
          const maxVisibleLines = Math.max(5, height - 12);
          setPromptScrollOffset((curOffset) => (next >= curOffset + maxVisibleLines ? next - maxVisibleLines + 1 : curOffset));
          return next;
        });
        return;
      }
      if (key.pageUp) {
        setPromptScrollOffset((prev) => Math.max(0, prev - 4));
        return;
      }
      if (key.pageDown) {
        setPromptScrollOffset((prev) => prev + 4);
        return;
      }
      // Ctrl+K clears prompt buffer (removes Ctrl+C so terminal is never terminated)
      if (key.ctrl && (input === "k" || input === "K")) {
        setPromptBuffer("");
        setPromptScrollOffset(0);
        setPromptLineCursor(0);
        setFeedbackMsg("Prompt cleared.");
        return;
      }
      // Ctrl+R resets to default role prompt (Requirement 5)
      if (key.ctrl && (input === "r" || input === "R")) {
        const def = stripLayer1Rules(activeRole.defaultPrompt);
        setPromptBuffer(def);
        setPromptScrollOffset(0);
        setPromptLineCursor(Math.max(0, def.split("\n").length - 1));
        setFeedbackMsg("Prompt reset to default prompt.");
        return;
      }
      // Enter saves prompt
      if (key.return) {
        const cleaned = stripLayer1Rules(promptBuffer);
        const words = countWords(cleaned);
        if (words > 300) {
          setFeedbackMsg("Failed: Prompt exceeds 300 words limit.");
          return;
        }
        hook.setCustomInstructions(activeRole.slug, cleaned);
        setFeedbackMsg(`Prompt saved for ${activeRole.name} (${words}/300 words).`);
        setView("drilldown");
        return;
      }
      if (key.backspace || key.delete) {
        setPromptBuffer((prev) => {
          const next = prev.slice(0, -1);
          const lines = next.split("\n");
          setPromptLineCursor(Math.max(0, lines.length - 1));
          return next;
        });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setPromptBuffer((prev) => {
          const next = prev + input;
          const lines = next.split("\n");
          setPromptLineCursor(Math.max(0, lines.length - 1));
          return next;
        });
        return;
      }
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
    // 3. COLOR PALETTE VIEW (Requirement 9)
    // -------------------------------------------------------------------------
    if (view === "color_palette" && activeRole) {
      if (key.escape) {
        setView("drilldown");
        return;
      }
      // 4x4 Grid navigation:
      if (key.leftArrow) {
        setPaletteIndex((prev) => (prev > 0 ? prev - 1 : PALETTE_COLORS.length - 1));
        return;
      }
      if (key.rightArrow) {
        setPaletteIndex((prev) => (prev < PALETTE_COLORS.length - 1 ? prev + 1 : 0));
        return;
      }
      if (key.upArrow) {
        setPaletteIndex((prev) => (prev >= 4 ? prev - 4 : prev + 12));
        return;
      }
      if (key.downArrow) {
        setPaletteIndex((prev) => (prev + 4 < PALETTE_COLORS.length ? prev + 4 : prev % 4));
        return;
      }
      if (key.return) {
        const picked = PALETTE_COLORS[paletteIndex]?.color || "cyan";
        hook.setColor(activeRole.slug, picked);
        setFeedbackMsg(`Role color for ${activeRole.name} updated to ${PALETTE_COLORS[paletteIndex]?.label}.`);
        setView("drilldown");
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
          // Find current color index
          const curIdx = PALETTE_COLORS.findIndex((c) => c.color === activeRole.color);
          setPaletteIndex(curIdx >= 0 ? curIdx : 0);
          setView("color_palette");
        } else if (action.id === "edit_prompt") {
          const initialPrompt = activeRole.customInstructions || stripLayer1Rules(activeRole.currentPrompt) || "";
          setPromptBuffer(initialPrompt);
          setPromptScrollOffset(0);
          setPromptLineCursor(Math.max(0, initialPrompt.split("\n").length - 1));
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
              customInstructions: "",
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
  // RENDER: EDIT PROMPT SCREEN (Requirement 4 & 5)
  // ---------------------------------------------------------------------------
  if (view === "edit_prompt" && activeRole) {
    const words = countWords(promptBuffer);
    const isOverLimit = words > 300;

    // Wrap promptBuffer lines for terminal display and scrolling (Requirement 4)
    const maxLineLen = Math.max(40, width - 10);
    const rawLines = (promptBuffer || "(empty prompt - type below)").split("\n");
    const wrappedLines: string[] = [];
    rawLines.forEach((l) => {
      if (l.length <= maxLineLen) {
        wrappedLines.push(l);
      } else {
        for (let i = 0; i < l.length; i += maxLineLen) {
          wrappedLines.push(l.slice(i, i + maxLineLen));
        }
      }
    });

    const maxVisibleLines = Math.max(4, height - 9);
    const clampedOffset = Math.max(0, Math.min(promptScrollOffset, Math.max(0, wrappedLines.length - maxVisibleLines)));
    const visibleLines = wrappedLines.slice(clampedOffset, clampedOffset + maxVisibleLines);

    // Visual scrollbar track and thumb calculation (like Chat area)
    const totalLines = wrappedLines.length;
    const scrollbarHeight = maxVisibleLines;
    const scrollbarRows = totalLines <= maxVisibleLines ? [] : (() => {
      const thumbHeight = Math.max(
        1,
        Math.min(scrollbarHeight - 1, Math.round((scrollbarHeight / totalLines) * scrollbarHeight))
      );
      const maxScrollRange = Math.max(1, totalLines - maxVisibleLines);
      const scrollRatio = clampedOffset / maxScrollRange;
      const thumbTop = Math.min(
        scrollbarHeight - thumbHeight,
        Math.round(scrollRatio * (scrollbarHeight - thumbHeight))
      );

      return Array.from({ length: scrollbarHeight }, (_, i) => {
        const isThumb = i >= thumbTop && i < thumbTop + thumbHeight;
        let char = " ";
        if (isThumb) {
          if (thumbHeight === 1) {
            char = "┃";
          } else if (i === thumbTop) {
            char = "╻";
          } else if (i === thumbTop + thumbHeight - 1) {
            char = "╹";
          } else {
            char = "┃";
          }
        }
        return { index: i, isThumb, char };
      });
    })();

    return (
      <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        <Text bold color="cyan">
          Editing Prompt for {activeRole.name}
        </Text>
        <Text color="gray">
          Type instructions or guidelines for this role. Words:{" "}
          <Text color={isOverLimit ? "red" : "green"}>{words} / 300 words</Text>
        </Text>

        <Box
          marginY={0}
          paddingX={1}
          borderStyle="single"
          borderColor="gray"
          height={maxVisibleLines + 2}
          flexDirection="row"
          justifyContent="space-between"
          flexShrink={0}
        >
          <Box flexDirection="column" flexGrow={1}>
            {visibleLines.map((line, idx) => {
              const lineGlobalIdx = clampedOffset + idx;
              const isCurrent = lineGlobalIdx === promptLineCursor;
              return (
                <Box key={idx} flexDirection="row" flexShrink={0}>
                  <Text color={isCurrent ? "cyan" : "gray"} bold={isCurrent}>
                    {isCurrent ? "> " : "  "}
                  </Text>
                  <Text>{line}</Text>
                  {isCurrent && <Text color="cyan">█</Text>}
                </Box>
              );
            })}
          </Box>
          {scrollbarRows.length > 0 && (
            <Box flexDirection="column" width={1} marginLeft={1} flexShrink={0}>
              {scrollbarRows.map((row) => (
                <Box key={row.index} height={1}>
                  <Text color="cyan" bold={row.isThumb}>
                    {row.char}
                  </Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Dedicated 1-line feedback slot so shortcuts are never pushed off screen */}
        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>

        <Box marginTop={0} borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between" flexShrink={0}>
          <Text color="gray">
            Enter: save prompt   Ctrl+K: clear prompt   Ctrl+R: reset default   Up/Down: scroll   Esc: cancel
          </Text>
        </Box>
      </Box>
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
      { step: 4, title: "4. Base Prompt" },
      { step: 5, title: "5. Instructions" },
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

        {/* Step 1: Role Name (Inline cursor follows text, placeholder at start) */}
        {wizardStep === 1 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 1: Role Name
            </Text>
            <Text color="gray">
              Type a title for your custom role (e.g. Full Stack Engineer, Database Architect, Security Auditor).
            </Text>

            <Box marginY={1} padding={1} borderStyle="single" borderColor="gray" flexDirection="row">
              <Text color="green">&gt; </Text>
              {wizardData.name ? (
                <>
                  <Text bold color="white">{wizardData.name}</Text>
                  <Text color="cyan">█</Text>
                </>
              ) : (
                <>
                  <Text color="cyan">█</Text>
                  <Text color="gray"> (e.g. Full Stack Engineer)</Text>
                </>
              )}
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

        {/* Step 4: Suggested Base Prompt (Inline cursor follows text) */}
        {wizardStep === 4 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 4: Suggested Base Prompt for "{wizardData.name}" ({wizardData.roleFunction})
            </Text>
            <Text color="gray">
              Default role duties generated by Vecta. You can customize this or accept as is.
            </Text>

            <Box marginY={1} padding={1} borderStyle="single" borderColor="gray" flexDirection="row" flexWrap="wrap" minHeight={5}>
              {wizardData.basePrompt ? (
                <>
                  <Text>{wizardData.basePrompt}</Text>
                  <Text color="cyan">█</Text>
                </>
              ) : (
                <>
                  <Text color="cyan">█</Text>
                  <Text color="gray"> (type suggested base prompt instructions)</Text>
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Step 5: Custom Instructions (Inline cursor follows text) */}
        {wizardStep === 5 && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">
              Step 5: Custom Instructions for "{wizardData.name}" (Optional)
            </Text>
            <Text color="gray">
              Add guidelines or style rules. Words:{" "}
              <Text color={countWords(wizardData.customInstructions) > 300 ? "red" : "green"}>
                {countWords(wizardData.customInstructions)} / 300 words
              </Text>
            </Text>

            <Box marginY={1} padding={1} borderStyle="single" borderColor="gray" flexDirection="row" flexWrap="wrap" minHeight={5}>
              {wizardData.customInstructions ? (
                <>
                  <Text>{wizardData.customInstructions}</Text>
                  <Text color="cyan">█</Text>
                </>
              ) : (
                <>
                  <Text color="cyan">█</Text>
                  <Text color="gray"> (Press Enter to finish, or type custom instructions)</Text>
                </>
              )}
            </Box>
          </Box>
        )}

        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>

        {/* Footer with contextual navigation shortcuts */}
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">
            {wizardStep === 1 && "Enter / Right: next   Esc: cancel to roster"}
            {wizardStep === 2 && "Up/Down: select   Left: back to Name   Right / Enter: next to Agent   Esc: cancel"}
            {wizardStep === 3 && (browsingWizardDetectedModels
              ? "Up/Down: select model   Enter/Right: choose   Esc/Left: back to actions"
              : "Up/Down: select action   Left: back to Function   Right / Enter: choose   Esc: cancel")}
            {wizardStep === 4 && "Enter / Right: next   Left: back to Agent   Ctrl+R: reset   Ctrl+K: clear   Esc: cancel"}
            {wizardStep === 5 && "Enter: create role   Left: back to Base Prompt   Ctrl+K: clear   Esc: cancel"}
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
        <Box marginY={1} padding={1} borderStyle="single" borderColor="gray" flexDirection="row">
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
        <Box height={1} marginY={0} flexShrink={0}>
          {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
        </Box>
        <Text color="gray">Press Enter to confirm, Esc to cancel</Text>
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: COLOR PALETTE SCREEN (Requirement 9 & 10)
  // ---------------------------------------------------------------------------
  if (view === "color_palette" && activeRole) {
    const selectedColorObj = PALETTE_COLORS[paletteIndex] || PALETTE_COLORS[0]!;

    return (
      <Box flexDirection="column" width={width} paddingX={1} paddingY={0}>
        <Text bold color="cyan">
          Role Color Palette for {activeRole.name}
        </Text>
        <Text color="gray">Select a color to style role output tags in the chat stream.</Text>

        {/* 4x4 Visual Color Grid */}
        <Box marginY={1} flexDirection="column">
          {[0, 1, 2, 3].map((rowIdx) => (
            <Box key={rowIdx} flexDirection="row" gap={2} marginY={0}>
              {[0, 1, 2, 3].map((colIdx) => {
                const itemIdx = rowIdx * 4 + colIdx;
                const item = PALETTE_COLORS[itemIdx];
                if (!item) return null;
                const isSelected = itemIdx === paletteIndex;

                return (
                  <Box key={item.name} width={16} paddingX={1} borderStyle={isSelected ? "round" : undefined} borderColor={isSelected ? "white" : undefined}>
                    <Text color={item.color as any} bold={isSelected}>
                      {isSelected ? "> " : "  "}■ {item.label}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>

        {/* Live Chat Tag Preview Banner */}
        <Box marginY={1} padding={1} borderStyle="single" borderColor="gray" flexDirection="column">
          <Text bold color="gray">Live Chat Preview:</Text>
          <Box marginTop={0}>
            <Text bold color={selectedColorObj.color as any}>
              [{activeRole.name}]
            </Text>
            <Text> Writing LoginForm.tsx (type contracts verified)</Text>
          </Box>
        </Box>

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">Arrows: navigate palette grid   Enter: select color   Esc: cancel</Text>
        </Box>
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
        <Box marginTop={height < 24 ? 0 : 1} paddingX={1} borderStyle="single" borderColor="gray" flexDirection="column" flexShrink={0}>
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

        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexShrink={0}>
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
    const rawPrompt = activeRole.customInstructions || stripLayer1Rules(activeRole.currentPrompt) || "No prompt set";
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
          <Box marginY={height < 24 ? 0 : 1} paddingX={1} borderStyle="single" borderColor="yellow" flexShrink={0}>
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
                    {/* Indented autonomy explanation right underneath line when hovered (Requirement 8) */}
                    {action.id === "autonomy" && isSelected && action.explanation && (
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

        <Box marginTop={height < 24 ? 0 : 1} borderStyle="single" borderColor="gray" paddingX={1} flexShrink={0}>
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

      {/* Scrollable roster rows with flexShrink={0} so items never collapse (Item 8) */}
      <Box flexDirection="column">
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
              {r.autonomy && <Text color="magenta"> [{r.autonomy.toUpperCase()}]</Text>}
            </Box>
          );
        })}
      </Box>

      {/* Dedicated 1-line feedback slot */}
      <Box height={1} marginY={0} flexShrink={0}>
        {feedbackMsg ? <Text color="green">{feedbackMsg}</Text> : null}
      </Box>

      {/* Footer Status Bar */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} flexShrink={0}>
        <Text color="gray">
          Up/Down: navigate   Space: toggle [on]/[off]   Enter: select role   Esc: exit to chat
        </Text>
      </Box>
    </Box>
  );
};
