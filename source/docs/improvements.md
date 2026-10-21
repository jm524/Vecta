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






