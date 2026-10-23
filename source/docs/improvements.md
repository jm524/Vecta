---
tags:
  - audit
  - architecture
  - improvements
---

# Vecta CLI - Architectural Improvements

> [!info] Audit Overview
> This document tracks recommended structural upgrades, optimizations, and UX polish items to future-proof the application's architecture.

## Engine & Protocol

> [!todo] 1. Graceful Go Engine Shutdown
> **Location:** `source/interface/src/bridge/client.ts`
> **Current State:** The TS app exits by brutally killing the Go engine using `process.kill()`.
> **Improvement:** Implement a graceful `"action": "shutdown"` IPC message. When the Go engine manages SQLite or MongoDB instances in the future, a hard kill will corrupt user data. A shutdown message allows Go to flush data safely.

> [!todo] 2. Length-Prefixed IPC Protocol
> **Location:** `source/engine/main.go` & `client.ts`
> **Current State:** Relies on JSON Lines (`\n` separated) over standard IO, which is brittle for massive context windows.
> **Improvement:** Migrate to a Length-Prefixed Protocol (similar to the Language Server Protocol - LSP). This ensures robust message framing and eliminates the 64KB `bufio.Scanner` crash limit.

> [!todo] 3. Streaming Outputs & Task Cancellation Contexts
> **Location:** `source/engine/queue/queue.go`
> **Current State:** Task execution is synchronous and blocking. The UI waits for the entire task to complete before receiving a massive JSON block.
> **Improvement:** Stream outputs chunk-by-chunk over the IPC bridge to show live progress. Implement cancellation contexts so users can abort long-running tasks instantly.

> [!todo] 4. UUIDs for Request Tracking
> **Location:** `source/interface/src/bridge/client.ts`
> **Current State:** Request IDs are generated using a sequential integer (`this.requestCounter += 1`).
> **Improvement:** Switch to `crypto.randomUUID()`. Sequential IDs risk overlapping or colliding if the engine restarts, leading to Promise deadlocks or incorrect message mapping.

> [!important] 5. Enhanced Port Probing & Model Detection
> **Location:** `source/engine/scanner/scanner.go`
> **Current State:** Basic port checking and naive `.gguf` file matching.
> **Improvement:** **MAJOR IMPROVEMENT NEEDED:** We must improve the port running probe and model file name parsing as much as possible. This is a top priority to ensure we can robustly detect any local agents running and accurately identify all local AI files for the user.

---

## Interface & UX

> [!todo] 6. ESBuild Path Resolution
> **Location:** `source/interface/src/bridge/client.ts`
> **Current State:** Uses `path.resolve(__dirname, ...)` to find the Go binary.
> **Improvement:** Standardize all path lookups using the `getVectaDir()` helper. `__dirname` breaks unpredictably when `esbuild` bundles the TS code into `dist/main.js`, resolving to the wrong directory at runtime.

> [!todo] 7. Keyboard Event Clashing
> **Location:** `source/interface/src/app.tsx` & `useModeTab.ts`
> **Current State:** `Shift+Tab` is hardcoded to toggle the "Auto-accept Edits" feature.
> **Improvement:** Re-map this toggle to a safer shortcut (e.g., `Ctrl+A`). `Ink` natively uses `Shift+Tab` to navigate form inputs backwards, and hardcoding it will break UI focus when setting forms are introduced.

> [!done] 8. Resource-Aware Model Recommendations & App Closing Suggestions
> **Location:** Recommendation Engine / UI (`Day 9`)
> **Current State:** Implemented in `source/interface/src/services/recommendation.ts`. Uses live RAM usage and available bytes to evaluate safe model parameter sizing, issuing actionable advisories to close heavy apps (like browsers) when memory exceeds safe thresholds.

> [!done] 9. Transparent Background Server Lifecycle & Kill Controls
> **Location:** Runtime Manager / UI (`Day 9` & `Day 10`)
> **Status:** Implemented (Oct 13, 2026). The terminal displays active background inference server indicators in `/agent roles` and provides the `/server stop` slash command to release background process memory on demand.

> [!important] 10. Web-Based Starter Model Recommendations When Zero Local Models Found
> **Location:** Recommendation Engine & Onboarding (`Day 9` / `Day 10` / First Run)
> **Context:** When a user launches Vecta without any pre-downloaded local AI models (no Ollama models, LM Studio files, or `.gguf` weights on disk), Vecta currently queries online sources to recommend starter models tailored to their hardware specs. However, Vecta is fundamentally a multi-agent developer workspace, and many users may not have local models installed or may prefer using cloud API keys (Claude, OpenAI, Gemini) instead of downloading multi-gigabyte local files.
> **Improvement / Open Decision:** A clear architectural decision is required before the Congressional App Challenge submission (Oct 26):
> 1. Should Vecta offer a 1-click in-app model downloader, or simply provide the exact terminal commands for Ollama and LM Studio?
> 2. The zero-model state must present cloud API key assignment side-by-side with local model downloads so developers who prefer cloud models are not blocked or pressured into downloading heavy local weights.
> 3. Ensure offline environments gracefully fall back to hardware-tier presets without hanging or throwing network errors.

> [!todo] 11. Live System Advisories Integration into Terminal UI & Future Expansion
> **Location:** Recommendation Service (`services/recommendation.ts`) & CLI Interface (`Day 10`+)
> **Context:** Vecta now generates real-time hardware advisories (`buildSystemAdvisories`) evaluating memory load warnings, battery power-saving throttling, GPU shader acceleration readiness (Vulkan/DirectML/Metal/CUDA), and NVMe SSD mmap speed recognition.
> **UI Integration Plan:** In upcoming interface steps, these advisories will be wired directly into the live terminal UI (e.g., status bar, sidebar metrics, and `/agent roles` model selection).
> **Future Advisory Expansion:** We plan to expand the advisory engine with additional real-time monitors:
> 1. **CPU Thermal Throttling:** Detect when processor temperatures cause clock throttling that degrades token generation speeds.
> 2. **Background Process CPU Hogs:** Alert the user when external background tasks are consuming CPU cores needed by the inference engine.
> 3. **Context Window Memory Pressure:** Calculate whether massive conversation history buffers threaten to exceed remaining free RAM before dispatching tasks.
> 4. **Disk I/O Paging Saturation:** Monitor disk write queue length to detect when memory paging slows down system responsiveness.

> [!done] 12. Rescan Trigger Debouncing & Background Scan Lock
> **Location:** Engine Scanner (`scanner/scanner.go`) & `useRoles.ts`
> **Status:** Implemented (Oct 13, 2026). Guarded with an atomic scanning reference lock (`isScanningRef`) in `useRoles.ts` preventing parallel disk scans and port probe thrashing.

> [!todo] 13. Role Assignment Model Health Probe
> **Location:** Role Service (`services/recommendation.ts`) & `/agent roles` Screen
> **Context:** When assigning a local or cloud model to a role in `/agent roles`, Vecta currently relies on static catalog metadata.
> **Improvement:** Perform a lightweight test ping (e.g. 500ms HTTP `/props` or `/v1/models` check for local servers, or a test handshake) before saving the assignment. This provides instant visual feedback if a selected model server went offline or the file was deleted.

> [!todo] 14. Dedicated UI & Visual Feedback for `/server stop`
> **Location:** Background Server Lifecycle / UI (`app.tsx` & `agent-roles.tsx`)
> **Context:** In Phase 4, the `/server stop` command was introduced to let users stop background inference servers (such as Ollama or LM Studio) and reclaim system memory.
> **Current State:** Currently, typing `/server stop` prints a simple one-line text message to the chat stream.
> **Improvement Needed:** The interface for `/server stop` needs dedicated visual polish and control:
> 1. **Selective Shutdown Modal:** If multiple model runtimes are running at once, provide an interactive picker to stop individual servers (e.g., stop Ollama on port 11434 while keeping LM Studio running).
> 2. **Memory Reclamation Metrics:** Display a clear visual readout of reclaimed RAM and VRAM (e.g., "Released 5.2 GB system memory, GPU cache cleared").
> 3. **Direct Shortcut in `/agent roles`:** Add an inline shortcut button in the `/agent roles` roster banner (such as pressing 's') to stop background servers immediately without returning to the chat input.
> 4. **Shutdown Progress Indicator:** Display a brief status spinner while server processes terminate and ports clear.

> [!done] 15. Architectural Decoupling of Security Limits from Editable User Prompts
> **Location:** Role Engine (`roles/base.ts`, `roles/index.ts`) & Storage (`useRoles.ts`, `.vecta/`)
> **Context:** Layer 1 security limits (`LAYER_1_SYSTEM_PROMPT_RULES`) are permanent, immutable safeguards preventing prompt injection, out-of-scope file modifications, uninstructed code execution, and credential leaking.
> **Improvement Delivered:** Stripped all Layer 1 limits out of serialized storage (`config.json` and `custom-roles.json`) and role default prompt properties. Layer 1 limits now connect dynamically strictly at runtime via `assembleTaskPrompt()` before LLM dispatch. The prompt fields stored in `.vecta/` now exclusively contain clean role identity definitions and user custom instructions (max 300 words), ensuring security rules can never be edited, deleted, or bypassed via configuration files.

> [!done] 16. Interactive `/roles` Screen Ergonomics and Navigation Overhaul
> **Location:** Interface (`agent-roles.tsx`, `Chat.tsx`, `app.tsx`)
> **Context:** User requested streamlined UX for managing roles, selecting local/cloud agents, and reviewing role prompts.
> **Improvement Delivered:**
> 1. **Switch Agent Redesign:** Moved agent recommendations into a dedicated header section with role-specific rationales. "Detected Models" is now an interactive expandable action with a sub-selection dropdown for detected local models only. Starter models were decoupled from detected models.
> 2. **Clear Spacing & Prompt Preview:** Added spacing between metadata and actions in role drilldown. Formatted prompt preview across two indented lines followed by an ellipsis (`...`).
> 3. **Prompt Editor Scrolling:** Added multi-line wrapping and PgUp/PgDn / Ctrl+Up/Down scrolling inside the prompt editor. Removed single-character 'c' prompt-clearing conflict on empty lines.
> 4. **Anti-Collapse Roster Layout:** Widened role name columns to `width={28} flexShrink={0}` with single-row formatting, completely preventing word wrapping and checker autonomy badge collisions.
> 5. **Terminology Unification:** Replaced redundant `No Model (No Model)` displays with clean `No Agent` indicators across the UI.
> 6. **Custom Role Creation Fix:** Resolved wizard step advancement bug, enabling custom role name and description capture and persistent registration.

> [!done] 17. 5-Step Custom Role Creation Wizard, Visual Scrollbar, and Layout Enhancements
> **Location:** Interface (`agent-roles.tsx`, `Chat.tsx`, `Sidebar.tsx`, `app.tsx`, `main.ts`)
> **Context:** Implemented full Claude Doc 21 5-step wizard, scrollbar rail in prompt editor, and complete terminal UX cleanup.
> **Improvement Delivered:**
> 1. **Full 5-Step Custom Role Wizard:** Restored complete 5-step flow (Step 1: Role Name, Step 2: Role Function, Step 3: Assign Agent, Step 4: Suggested Base Prompt, Step 5: Custom Instructions).
> 2. **Bidirectional Wizard Navigation:** Added Left / Right arrow navigation so users can review previous inputs (e.g., Left arrow on Function goes back to Name, Right arrow goes to Agent Assignment).
> 3. **OS-Specific Agent Download Commands:** Switch Agent recommendations now render exact terminal download commands (`ollama run ...`) and setup commands (`winget install ...`, `brew install ...`, `curl ...`) adapted to the user's OS and detected Ollama runtime status.
> 4. **Prompt Editor Visual Scrollbar:** Added smooth Up/Down arrow / touchpad scrolling without PgUp/PgDn hints, plus a floating visual scrollbar rail (`┃`, `╻`, `╹`) on the right side of the prompt box.
> 5. **Role Drilldown 3-Line Preview:** Expanded prompt preview to 3 visible lines followed by indented `...`.
> 6. **Main Interface Mode Relocation & Borderless Chat:** Removed outer chat border, relocated the `[PLAN]` / `[BUILD]` mode indicator to the top of the sidebar, added idempotent `/build` and `/plan` commands, documented `Tab` mode switching in `/help`, and added visible typing cursor (`█`) across all inputs.
> 7. **Status Banner Spacing:** Standardized vertical margins (`marginY={1}`) across all feedback and status messages.
> 9. ***Scanner for CLI's or 

> [!done] 18. UX Polish, Borderless Screens, Dynamic Hardware Recommendations & Anti-Collapse Layout
> **Location:** Interface (`agent-roles.tsx`, `Chat.tsx`)
> **Context:** Addressed user feedback regarding spaciousness, typing cursor accuracy, layout collapsing, and wizard ergonomics.
> **Improvement Delivered:**
> 1. **Wizard Step 3 Detected Models Sub-Dropdown:** Integrated interactive Detected Models action with sub-selection dropdown into Step 3 of the Custom Role Wizard, allowing instant assignment of detected local models.
> 2. **Inline Typing Cursor Fix:** Resolved typing cursor glitch where placeholder caused the cursor `█` to get stuck. The cursor now reliably follows typed text inline and sits at index 0 when empty.
> 3. **Dynamic Hardware RAM Recommendations:** Switch Agent recommendations dynamically adapt to hardware scans (32B/70B for RAM >= 32GB, 8B/14B for 16-24GB, 3B/7B for <16GB) with exact download commands.
> 4. **Spacious Borderless Layout:** Removed outer cyan borders across all `/roles` views (`roster`, `drilldown`, `switch_agent`, `wizard`, `edit_prompt`, `input_text`, `color_palette`) for an open, modern aesthetic.
> 5. **Prompt Editor Active Line Tracker:** Added a cyan `>` pointer on the left margin following the active line being edited.
> 6. **Removed Redundant Top-Right Banner:** Removed the "Tab: Switch to Plan / Build" notice in `Chat.tsx`.
> 7. **Roster Windowed Scrolling:** Implemented windowed scrolling centered on active role selection with `flexShrink={0}` and indicators for overflow rows.
> 8. **Anti-Collapse Action Rows & Dedicated Feedback Slot:** Added `flexShrink={0}` to all action lines and converted feedback messages to a fixed 1-line slot across drilldown, switch agent, wizard, and input text screens, completely preventing UI collapse or shift when feedback appears.

> [!done] 20. Two-Tab Memory Architecture, Collapsing Bullets, Responsive Input Lines & Blank Chat Launch
> **Location:** Memory & Session Subsystems (`memory.tsx`, `settings.tsx`, `useSession.ts`, `app.tsx`)
> **Context:** Upgraded memory ergonomics per Claude Docs 12 & 13 and unified session initialization.
> **Improvement Delivered:**
> 1. **Two-Tab `/memory` Layout:** Dedicated **Chats** tab for per-chat key points and 350-word `summary.json` summaries alongside **Cross Chat** tab for Global Preferences and 700-word scoped CCMs.
> 2. **Collapsing Bullet Points:** Inactive items display `• `; active selection cleanly collapses into `> ` and re-emerges on navigation with zero text jitter.
> 3. **Seamless Arrow Flow & Direct Enter Editing:** `Up`/`Down` arrows transition smoothly between Key Points and Narrative sections; `Enter` directly edits without `'e'` shortcut.
> 4. **Dynamic Responsive Lines & Dual Save:** Input canvases hug text height reactively; `Enter` or `Esc` immediately saves and exits.
> 5. **Blank Chat on CLI Launch:** Startup always opens to an unsaved blank standalone chat, officially creating the chat on disk only when the user sends a message. Added `/new` command.

> [!todo] 21. Atomic Multi-Process File Locking for `.vecta/` Storage
> **Location:** `source/interface/src/services/chat-service.ts`, `source/state/memory.ts`, `source/state/config.ts`
> **Current State:** Direct `fs.writeFileSync` and `fs.readFileSync` calls lack file locking or atomic replacement guards.
> **Improvement:** Implement atomic write guards (writing to `.tmp` files and replacing atomically via `fs.renameSync`) or lockfile mechanisms across all state writers. This prevents empty file reads and partial write corruption when background tasks (such as Documenter passive copy) execute concurrently with active chat message saves.

> [!todo] 22. Recursive Process-Tree Teardown (`taskkill /T /F` & `SIGKILL` Process Group)
> **Location:** `source/interface/src/bridge/client.ts`
> **Current State:** `engineBridge.stop()` invokes standard `child_process.kill()`, which leaves orphaned background child and grandchild worker processes running on Windows.
> **Improvement:** Wrap subprocess termination in an OS-aware lifecycle manager: execute `taskkill /pid <PID> /T /F` on Windows (`win32`) and send `SIGKILL` to the process group (`process.kill(-pid, 'SIGKILL')`) on Unix to cleanly terminate the entire process hierarchy.

> [!todo] 23. Offline Ollama Model Detection via Manifest Ingestion
> **Location:** `source/engine/scanner/scanner.go`
> **Current State:** When the Ollama daemon is offline (port 11434 closed), Vecta cannot detect any Ollama models on the hard drive because weights are stored as extensionless SHA256 hashes in `blobs/`.
> **Improvement:** Add an offline manifest parser in `scanner.go` that inspects `~/.ollama/models/manifests/`. Each manifest JSON contains model metadata (parent tag, parameter size, quantization) and maps to its blob digest. This provides 100% offline detection of local Ollama models even when the server daemon is not running.

> [!todo] 24. Graceful Terminal Viewport Degradation & Min-Height Guard Banner
> **Location:** `source/interface/src/app.tsx`, `source/interface/src/components/Chat.tsx`
> **Current State:** Running Vecta in terminal panes with fewer than 14 rows causes nested headers, status bar, and input areas to overflow, producing terminal scroll jitter.
> **Improvement:** Implement an active terminal dimension guard in `app.tsx`. If `terminalSize.rows < 14` or `terminalSize.columns < 50`, render a dedicated minimal fallback notice: `Terminal window too compact (current: X×Y, min: 50×14). Please expand your terminal.` to protect layout stability.

> [!todo] 25. Centralized Slash Command Dispatch Registry
> **Location:** `source/interface/src/app.tsx`, `source/interface/src/components/Chat.tsx`
> **Current State:** Slash commands are defined in two separate places: `BASE_SLASH_COMMANDS` in `Chat.tsx` and an `if (trimmed === ...)` cascade in `app.tsx`. Planned commands (`/clear`, `/lock`, `/usage`, `/token-weekly`) fall through to the LLM pipeline.
> **Improvement:** Consolidate all slash commands into a single typed command registry (`CommandRegistry`) mapping command names, aliases, description, autocomplete hints, and execution handlers. Intercept `/clear` to reset the active chat screen and provide helpful status notices for planned modules.

> [!todo] 26. Bidirectional Scope Synchronization Between Project Workspaces and Memory
> **Location:** `source/interface/src/services/chat-service.ts`, `source/state/memory.ts`
> **Current State:** Renaming or deleting projects mutates `projects/index.json` and `meta.json`, but does not update `CCM.json` `scopeName`, causing `/memory` to show stale project names.
> **Improvement:** Implement an event hook (`projectService.onRename`, `projectService.onDelete`) that updates `scopeName` in `.vecta/projects/[id]/CCM.json`, cleans up dangling references, and resets `session.startBlankChat()` if the currently active chat was deleted.

> [!important] 27. On-Demand Audit Log Decryption and Re-Encryption Commands (`/decrypt` & `/encrypt`)
> **Location:** `source/interface/src/commands/` & `source/roles/documenter.ts`
> **Context:** Claude Doc 14 ("User Viewing the Raw Log") and Sprint Plan §2B ("The Decrypt Flow").
> **Current State:** Documenter passively encrypts every interaction to `raw_[scramble].log` on disk using AES-256-GCM. There is no instant CLI slash command for the user to temporarily inspect or re-secure their full raw audit minutes for the active chat.
> **Improvement:**
> 1. **`/decrypt` Command:** Decrypts the active chat's `raw_[scramble].log` in memory using the OS vault master key. Per Claude Doc 14, to prevent freezing terminal emulators with large logs (up to 256MB), Vecta writes the decrypted plaintext to a secure OS temp file (e.g., `%TEMP%/vecta/raw-[chatId]-decrypted.log`) and provides the exact clickable file path so the user can open it in any text editor.
> 2. **Persistent Standing Reminder:** Per Claude Doc 14, Manager marks the log as unencrypted and presents a reminder banner at natural task checkpoints: `[Manager] Reminder: raw log still decrypted. Type /encrypt when finished viewing.`
> 3. **`/encrypt` Command:** User runs `/encrypt` to immediately wipe and securely delete the temporary plaintext file from disk, returning the chat's audit trail to a sealed at-rest state.

> [!todo] 28. Multi-Drive & External Storage Model Detection (`D:`, `E:`, Removable Drives)
> **Location:** `source/engine/scanner/scanner.go`, `source/engine/scanner/models.go`
> **Context:** Users with large local AI models frequently store Ollama models or `.gguf` weights on secondary NVMe, external SSDs, or dedicated media partitions (e.g., `D:\OllamaModels`, `D:\models`, `E:\AI_Models`) to preserve space on their primary OS drive (`C:\`).
> **Current State:** The Go hardware and model scanner primarily probes default paths under the user home directory (`~/.ollama/models`, `~/models`, `C:\Users\<user>\...`) and configured workspace folders. If an external drive or secondary volume is connected (such as `D:\`), Vecta does not automatically discover models unless specifically passed as a custom path.
> **Improvement:**
> 1. **Drive Letter & Volume Enumeration:** Add cross-platform volume scanning in `scanner.go` (e.g. iterating Windows drive letters `D:` through `Z:`, or `/Volumes/` on macOS and `/mnt/` / `/media/` on Linux).
> 2. **Standard Folder Probing:** Automatically probe known directory names on discovered volumes (such as `<Drive>:\OllamaModels`, `<Drive>:\.ollama`, `<Drive>:\models`, `<Drive>:\gguf`).
> 3. **Environment Variable Ingestion:** Check `OLLAMA_MODELS` environment variable which directs Ollama storage to alternative drives like `D:\OllamaModels`.

> [!todo] 29. Default Vecta Model System Prompt Specialization and Domain Refinement
> **Location:** `source/engine/models/Modelfile`
> **Context:** Vecta uses a customized Llama 3.1 8B tag (`vecta-default`) as its primary local coding model.
> **Current State:** `Modelfile` defines a foundational system prompt enforcing zero emojis, technical conciseness, boundary compliance, and 4-layer prompt awareness.
> **Improvement:**
> 1. **Domain-Specific Handoff Formatting:** Tailor the system prompt with strict output tokens and delimiters so that Coder outputs machine-parseable code diffs that Reviewer and Documenter can ingest directly without regex parsing errors.
> 2. **Terminal Viewport Constraints:** Instruct the model to avoid generating sprawling, unfocused explanations that exceed typical terminal heights (preventing scroll-jitter and token waste).
> 3. **Vecta Architecture Specialization:** Embed knowledge of Vecta's directory layout (`source/engine/`, `source/interface/`, `source/roles/`, `source/state/`) so the model writes idiomatic Vecta code natively when tasked with extending the CLI.
> 4. **Few-Shot Examples:** Integrate concise few-shot input/output examples within the Modelfile to guide deterministic code refactoring and clean unified diff generation.

> [!todo] 30. Setup Wizard Pre-Flight Verification for Local Model Prerequisites
> **Location:** `source/interface/src/` & `source/engine/scanner/`
> **Context:** Packaging and first-run user onboarding (Oct 25, Day 22).
> **Current State:** The default local model fallback (`llama-3.1-8B`) requires a local Ollama server running on `127.0.0.1:11434` to execute the weights.
> **Improvement:**
> 1. **Ollama Pre-Flight Detection:** Before prompting the user to download the default model (`vecta-default` / `llama-3.1-8B`), verify if Ollama is installed and running.
> 2. **Clear Guidance on Missing Dependency:** If Ollama is not installed or unreachable, avoid attempting a failing download. Display clear actionable instructions: provide the link to install Ollama (`https://ollama.com`), or offer immediate fallback to cloud API keys (Groq, OpenAI, Anthropic) in `/roles`.
> 3. **Disk Space Verification:** Ensure the target drive has at least 5.5GB of free space before initiating any local model pull to prevent mid-download storage exhaustion.

> [!important] 31. Real Model Response Latency Optimization & Output Structuring via Prompt Engineering
> **Location:** `source/engine/models/inference.go`, `source/roles/`, `source/engine/queue/queue.go`
> **Context:** Field testing with local 3B/8B models on local hardware (Oct 23, Day 20).
> **Current State:** The local model executes and replies, but response latency can be further minimized, and raw model responses vary in structure without strict output formatting.
> **Improvement:**
> 1. **Inference Latency & CPU Optimization:**
>    - **Context Window Capping (`num_ctx`):** Cap Ollama context window (e.g., `num_ctx: 2048` or `4096`) instead of model maximums (8K-128K). Reduces CPU prompt evaluation time (`prompt eval time`) from minutes to under 2 seconds.
>    - **Thread Tuning (`num_thread`):** Configure Ollama's `num_thread` option dynamically to match the machine's physical CPU cores (e.g. 6-8 threads on Intel i5/i7) for optimal compute efficiency without thread thrashing.
>    - **Output Token Prediction Cap (`num_predict`):** Bound response lengths (e.g., 400-600 tokens for Manager orchestration, 1000 tokens for Coder) to prevent runaway generations and deliver snappier responses.
>    - **Live Token Streaming:** Implement chunk-by-chunk token streaming from Ollama -> Go engine -> TypeScript chat so tokens stream onto the screen in real-time, eliminating perception of delay.
> 2. **Response Structuring Through Prompt Engineering:**
>    - **Strict Output Contracts in Role Prompts:** Enhance `assembleTaskPrompt()` and system prompts (`MANAGER_DEFAULT_PROMPT`, `CODER_DEFAULT_PROMPT`, `PLANNER_DEFAULT_PROMPT`) with strict section delimiters (e.g., `### Plan`, `### Files to Modify`, `### Implementation`).
>    - **Zero Conversational Fluff:** Explicit negative prompt engineering forbidding polite preambles (e.g. "Sure, I can help with that...", "As an AI model...", "Here is what I will do..."). Enforce immediate technical delivery.
>    - **Machine-Parseable Code Blocks:** Ensure code responses strictly use fenced code blocks with file path headers (` ```<lang> path/to/file `) and clean diff formatting for seamless ingestion by Checkers and Documenter.
>    - **Compact Terminal Viewport Sizing:** Train prompt instructions to structure bullet points and summaries compactly, preventing vertical scroll overflow and terminal layout jitter.

> [!important] 32. Connected Phone Mobile Application Redesign, Modular Architecture, & Visual Identity Overhaul
> **Location:** `source/device/`
> **Context:** Mobile client field review (Oct 23, Day 20).
> **Current State:** The mobile client previously used the working title "Vecta Companion" and had a functional but initial prototype aesthetic that felt unpolished (stock cards, basic bottom navigation, generic typography).
> **Improvement:**
> 1. **Product Rebranding & Architectural Naming:**
>    - Transition terminology from "companion" to "connected phone" / "connected device" / "device bridge" across all documentation, UI screens, tests, and source directories.
>    - Rename root mobile directory from `source/companion` to `source/device`.
> 2. **Modular Component Architecture (Flutter Best Practices):**
>    - Decompose the monolithic `main.dart` into a clean, decoupled component hierarchy under `source/device/lib/`:
>      - `constants/theme.dart`: Centralized design system tokens, role palette, typography, and dynamic theme resolution.
>      - `models/device_state.dart`: Immutable data models for chat messages, tasks, roles, and server payload synchronization.
>      - `services/device_api.dart`: Isolated network layer handling bidirectional polling, endpoint auto-discovery (`127.0.0.1` loopback vs `10.0.2.2` emulator alias), remote actions, and non-blocking error handling.
>      - `components/status_bar.dart`: System health indicators, real-time connection status dot, and generating status badges.
>      - `components/generating_indicator.dart`: Role generation indicator banner with animated progress state.
>      - `views/chat_tab.dart`: High-density monospace chat stream with optimistic remote prompt dispatch.
>      - `views/tasks_tab.dart`: Task metrics header and pipeline stage checklist cards with live status badges.
>      - `views/roles_tab.dart`: Autonomous agent workforce roster with remote activation toggles.
>      - `screens/home_screen.dart`: Tab coordinator and lifecycle controller linking all modular components.
>    - Embed comprehensive, professional code comments documenting architectural contracts, data flow, and state transitions.
>    - Maintain strictly zero emojis across all code, docstrings, comments, and UI strings.

> [!todo] 33. CLI `/settings` Dynamic Theme Color Synchronization with Connected Phone Application
> **Location:** `source/interface/src/commands/settings.tsx`, `source/engine/device/device.go`, `source/device/lib/constants/theme.dart`
> **Context:** Cross-platform design system coherence and customization.
> **Current State:** Terminal theme preferences (e.g. primary accents, role tints, border colors) configured in the desktop CLI via `/settings` remain local to the terminal Ink canvas. The connected mobile phone uses fixed hardcoded color constants.
> **Improvement:**
> 1. **Bridge State Theme Payload:** Extend `DeviceState` in the Go bridge engine and `device-bridge.ts` to include an active `theme` payload containing primary, secondary, background, role, and status colors.
> 2. **Dynamic Mobile Theme Consumption:** In `source/device/lib/constants/theme.dart`, implement dynamic theme derivation that ingests the theme payload received from `/api/state` and updates the Flutter `ThemeData` and role color maps in real-time.
> 3. **Seamless Visual Continuity:** Changes made to color schemes or accent preferences in CLI `/settings` instantly propagate to the connected phone interface without requiring an app reload or reconnection.

> [!important] 34. Task Queue Reactivity, Live Responsiveness, & Performance Overhaul
> **Location:** `source/interface/src/hooks/useQueue.ts`, `source/interface/src/views/QueueView.tsx`, `source/engine/queue/queue.go`
> **Context:** Real-time multi-agent execution pipeline feedback.
> **Current State:** Under intensive model streaming or rapid multi-step autonomous task decomposition, the CLI task queue view can experience unresponsiveness, lag in rendering stage progress, or batched UI updates that drop intermediate progress frames.
> **Improvement:**
> 1. **Decoupled Event Streaming:** Decouple heavy LLM token streaming from task queue status updates. Route high-frequency token events through an independent lightweight emitter while publishing queue stage transitions (Pending -> In Progress -> Completed/Failed) through dedicated, debounced state dispatchers.
> 2. **Instant UI State Dispatch:** In `useQueue.ts`, eliminate polling latency by adopting push-based event dispatching for task additions, role handoffs (e.g., Planner -> Coder -> Reviewer -> Documenter), and completion signals.
> 3. **Zero-Lag Queue Inspector:** Optimize `QueueView.tsx` render cycles with memoized task cards and viewport virtualization, ensuring smooth terminal rendering and zero UI freezing during autonomous execution.
> 4. **Reliable Cancellation & Exception Trapping:** Ensure that task cancellation (via keyboard abort or mobile client remote request) immediately halts the Go worker pool, clears pending queue items, and renders clear cancellation feedback across both desktop and connected phone interfaces.

> [!todo] 35. Single-Plug Wireless Device Link (USB Once, Seamless Wireless Local Bridge)
> **Location:** `source/interface/src/services/device-bridge.ts`, `source/engine/device/device.go`
> **Context:** Developer ergonomics and physical mobile hardware mobility.
> **Current State:** The device bridge requires a continuous physical USB connection with `adb reverse tcp:8765 tcp:8765`. If the user disconnects the USB cable, the connection drops immediately.
> **Improvement:**
> 1. **Single-Plug USB Pairing Workflow:**
>    - When a phone is plugged in via USB, the CLI initiates a one-time pairing sequence: `adb tcpip 5555`.
>    - The bridge discovers the phone's local Wi-Fi IP address automatically via `adb shell ip route` or `adb shell ip -f inet addr show wlan0`.
>    - The bridge issues `adb connect <device-ip>:5555` to establish wireless ADB communication over the local network.
> 2. **Unplug & Continue Seamlessly:**
>    - Once wireless ADB is established, the user can unplug the USB cable. The bridge continues streaming state and accepting remote prompts over the wireless local socket.
> 3. **Strict Local-Network Security Boundary:**
>    - Wireless communication is strictly restricted to the local subnet (100% offline-compatible; zero external cloud routing, zero third-party relays).
> 4. **Self-Healing Connection Daemon:**
>    - If the Wi-Fi connection drops or latency spikes, the bridge enters a standby auto-recovery loop and seamlessly re-engages USB mode the moment the cable is re-attached.

> [!important] 36. Real Model Tool Calling Engine & Autonomous Workspace CLI Actions (Go Sandbox Bounded)
> **Location:** `source/engine/models/inference.go`, `source/engine/queue/queue.go`, `source/engine/tools/`, `source/roles/coder.ts`, `source/interface/src/hooks/useQueue.ts`
> **Context:** Autonomous developer workflow execution (Oct 24, Day 21).
> **Current State:** Real models (local Ollama models such as `llama3.2:3b`, `qwen2.5-coder:3b`, or cloud providers) currently output raw text or unified diff snippets into the chat stream. They cannot directly execute file inspections, apply targeted file edits, or run commands autonomously. The user or a brittle external script must manually copy and apply the output.
> **Improvement:**
> 1. **Core Tool Suite (CLI Agent Capabilities):**
>    Implement a foundational set of developer tools matching modern AI coding assistants, implemented natively in Go within the engine's execution loop:
>    - `read_file(path, start_line, end_line)`: Reads target file contents with optional line-range slicing to preserve token context windows on large source files.
>    - `write_file(path, content, overwrite)`: Creates new files or overwrites existing files within allowed project boundaries, creating parent directories automatically.
>    - `edit_file(path, target, replacement)`: Performs precise, contiguous block search-and-replace edits with exact whitespace matching, ensuring atomic code updates without clobbering whole files.
>    - `list_directory(path, recursive, max_depth)`: Enumerates files and directory hierarchies to help models inspect workspace structure.
>    - `search_files(pattern, path, file_filter)`: Rapid regex or keyword searching across workspace files (grep-like exploration).
>    - `run_command(command, args, timeout_seconds)`: Executes safe workspace shell commands (e.g. `npm test`, `go test`, `tsc --noEmit`, `git status`) with stdout/stderr capture, exit code reporting, and timeout guards.
> 2. **Go Engine Layer 1 Security Sandbox Enforcement:**
>    - All tool calls must be strictly validated against Vecta's Layer 1 OS filesystem boundary rules (`filepath.Rel()` directory nesting checks in `queue.go`).
>    - Path traversal attacks (`../`, symlink escapes, absolute drive paths outside workspace) are rejected deterministically before execution.
>    - Sensitive path blacklists: Tool execution is strictly forbidden from accessing `.env`, `.git/`, `.vecta/keys/`, OS credential stores, or system directories.
>    - Destructive command gates: Commands attempting destructive system modifications (e.g. `rmdir /s /q C:\`, disk formatting, registry edits) are trapped and aborted by the Go execution filter.
> 3. **Structured Tool Calling Protocol (Dual-Mode):**
>    - **Native Function Calling:** For models supporting structured tool schemas (Ollama tool calling API, OpenAI/Groq function calling), pass JSON schemas describing tool parameters and parse `tool_calls` in response payloads.
>    - **Fenced XML/JSON Tool Protocol Fallback:** For lightweight local models (e.g. 3B parameter weights) that struggle with complex function schemas, support deterministic text-based tool call fences:
>      ```xml
>      <tool_call>
>      {"name": "edit_file", "arguments": {"path": "source/main.go", "target": "oldCode", "replacement": "newCode"}}
>      </tool_call>
>      ```
> 4. **Agentic Tool Loop Orchestration (Multi-Turn Execution):**
>    - When a model outputs one or more tool calls, the Go runner intercepts them, validates security boundaries, executes the operations sequentially, and feeds formatted tool outputs (`<tool_response>...</tool_response>`) back into the context.
>    - The model inspects the execution results (e.g., test output, compiler error, file diff) and either executes corrective tool calls or outputs the final completion message.
>    - Enforce a maximum turn limit (e.g. 5-10 tool steps per task) and integrate with the 3x hash loop tripwire to prevent infinite model hallucination loops.











