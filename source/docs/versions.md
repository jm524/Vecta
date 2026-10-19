# Vecta Version Changelog & Sprint Release Track

> Versioning strategy for the 23-day Congressional App Challenge sprint (Oct 4 → Oct 26, 2026).
> Each day of the sprint increments a minor patch version (`v0.0.1` → `v0.0.23`), culminating in the final competition release: **`v0.1.0`** on **October 26, 2026**.

---

## Sprint Roadmap & Version Mapping

| Date | Version | Sprint Phase & Milestone |
|:---|:---|:---|
| **Oct 4** | **`v0.0.1`** | **Day 1: Wrap-Up & Scaffolding** — Toolchain verification (Go 1.27, Bun 1.4, Node 24), repo scaffold, `dev` branch, path aliases, test `.vecta/` storage. |
| **Oct 5** | **`v0.0.2`** | **Day 2: Core Stdio Bridge** — Ink `app.tsx` hello world + Go `main.go` + JSON stdio bridge round-trip. |
| **Oct 6** | **`v0.0.3`** | **Day 3: Terminal Layout Shell** — StatusBar, basic layout shell, Manager input/output loop. |
| **Oct 7** | **`v0.0.4`** | **Day 4: Queue Engine** — TypeScript FIFO queue + Go sequential dispatch runner. |
| **Oct 8** | **`v0.0.5`** | **Day 5: First Roles** — `roles/base.ts` shared interface + Manager & Coder with defaultPrompts. |
| **Oct 9** | **`v0.0.6`** | **Day 6: Handshake Protocol** — `task-relay.tmp` file handshake + Documenter passive copy. |
| **Oct 10** | **`v0.0.7`** | **Day 7: E2E Pipeline** — Full end-to-end task run: Manager → Coder → Documenter. |
| **Oct 11** | **`v0.0.8`** | **Day 8: Hardware Scanner** — Go scanner: RAM, disk, GPU/VRAM + runtime ports (11434, 1234, 8080). |
| **Oct 12** | **`v0.0.9`** | **Day 9: Model Catalog** — Query model runtimes, scan `.gguf` files on disk, build recommendation logic. |
| **Oct 13** | **`v0.0.10`** | **Day 10: Model Integration** — Wire catalog & recommendations into `/agent roles`, spawn/stop `llama.cpp`. |
| **Oct 14** | **`v0.0.11`** | **Day 11: Role Configuration UI** — `/agent roles` interactive roster, toggles, model picker drill-down. |
| **Oct 15** | **`v0.0.12`** | **Day 12: Prompts & Styling** — `/prompt` custom instruction editor (≤300 words) + role color picker. |
| **Oct 16** | **`v0.0.13`** | **Day 13: Chats & Projects UI** — `/chats`, `/projects`, and `/queue` inspector overlay. |
| **Oct 17** | **`v0.0.14`** | **Day 14: Settings & Mode Switching** — `/memory`, `/settings`, and instant `Tab` mode switching (Planning/Impl). |
| **Oct 18** | **`v0.0.15`** | **Day 15: Documenter & Raw Log** — Full Documenter copy handshake, `raw.log` logging, `manager-duties.json`. |
| **Oct 19** | **`v0.0.16`** | **Day 16: OS Vault Encryption** — Windows DPAPI key generation, AES-GCM encrypt-on-write and decryption flow. |
| **Oct 20** | **`v0.0.17`** | **Day 17: Log Compaction & Memory** — Ring-buffer pruning, 2-week inactivity cleanup, 350-word `summary.json`. |
| **Oct 21** | **`v0.0.18`** | **Day 18: Core Resilience** — Cross-Chat Memory (`CCM.json`), token sidebar counters, hash loop detector (3x). |
| **Oct 22** | **`v0.0.19`** | **Day 19: Device Server** — Localhost Go server (`127.0.0.1`) + `adb reverse` reverse tunnel setup. |
| **Oct 23** | **`v0.0.20`** | **Day 20: Android Client** — Android emulator client: remote chat view and live task status sidebar. |
| **Oct 24** | **`v0.0.21`** | **Day 21: Remote Control Sync** — Role toggle & `/prompt` sync back to host machine, session persistence. |
| **Oct 25** | **`v0.0.22`** | **Day 22: Failsafe & Demo Polish** — Disconnect auto-pause & reconnect grace window, full demo rehearsal. |
| **Oct 26** | **`v0.1.0`** | **DEADLINE RELEASE** — Package native binaries + device emulator client for Congressional App Challenge. |

---

## Detailed Changelog

### v0.0.1 — October 4, 2026
#### Added
- Scaffolding of complete repository tree adhering to Doc 02 specification across `interface/`, `engine/`, `roles/`, `state/`, and `docs/`.
- Dual toolchain setup: Go 1.27.0 native systems engine + TypeScript (Node 24 / Ink 5 / React 18) UI frontend.
- Strict TypeScript configuration (`tsconfig.json`) with path aliases (`@roles/*`, `@state/*`, `@interface/*`).
- JSON stdio bridge contracts (`interface/src/types/bridge.ts` and `engine/bridge/bridge.go`).
- Development path resolver (`interface/src/helpers/paths.ts`) isolating runtime files into `source/.vecta/`.
- Test runtime environment with starter `config.json`, `general.json`, and `CCM.json`.
- Comprehensive documentation suite covering architecture, roles, privacy, development, execution flows, and debugging.

#### Fixed
- Fixed ESM URL resolution for `__dirname` using `fileURLToPath(import.meta.url)`.
- Resolved TypeScript 5 deprecation warning on `baseUrl` when `"moduleResolution": "bundler"` is active.
- Added `@types/node` to resolve core Node API typings across the interface layer.

### v0.0.2 — October 5, 2026
#### Added
- Implemented Go stdio JSON engine in `engine/main.go` and `engine/bridge/bridge.go`.
- Compiled native binary `engine/vecta-engine.exe`.
- Created TypeScript `EngineBridge` client in `interface/src/bridge/client.ts` with subprocess lifecycle management.
- Implemented root Ink UI in `interface/src/app.tsx` with live bridge connection status.
- Created `interface/src/main.ts` with clean OS signal teardown and storage initialization.
- Added automated round-trip verification test in `interface/src/test-bridge.ts`.

### v0.0.3 — October 6, 2026
#### Added
- Implemented `hooks/useModeTab.ts` for instant `Tab` key mode switching between Planning and Implementation.
- Implemented `components/StatusBar.tsx` bottom bar with active mode pill, current model, and shortcut hints.
- Implemented `components/Sidebar.tsx` with live token counters (10k warning cap) and pipeline task list, toggleable via `Ctrl+→` and `Ctrl+←`.
- Implemented `components/Chat.tsx` with conversation stream and interactive `ink-text-input` prompt box.
- Composed master terminal shell in `app.tsx` with Alternate Screen Buffer (`\x1b[?1049h` / `\x1b[?1049l`) for clean full-screen rendering and clean exit restoration.
- Wired Manager I/O loop: keyword heuristic pipeline assembly in Implementation mode and architecture decomposition in Planning mode.
- Built-in command handling for `/help`, `/exit`, and `/quit`.

### v0.0.4 — October 7, 2026
#### Added
- Implemented in-memory FIFO task queue manager in `state/session.ts`.
- Implemented Go sequential dispatch engine in `engine/queue/queue.go` enforcing Layer 1 OS filesystem boundaries.
- Added `queue_dispatch` action and typed payload contracts in `interface/src/types/bridge.ts` and `engine/bridge/bridge.go`.
- Implemented `hooks/useQueue.ts` coordinating single-task sequential dispatch to Go.
- Connected live queue progress to `app.tsx` and `components/Sidebar.tsx` with dynamic status markers (`[●]`, `[✓]`, `[ ]`), role chat responses, and token accumulation.
- Added automated queue test suite in `interface/src/test-queue.ts`.

### v0.0.5 — October 8, 2026
#### Added
- Implemented `roles/base.ts` shared role interface defining `RoleFunction`, `RoleStage`, `Layer1Limits`, `Layer2Limits`, and `assembleTaskPrompt` 4-tier prompt builder.
- Implemented `roles/manager.ts` with canonical `defaultDuties` (9 core responsibilities) and comprehensive `MANAGER_DEFAULT_PROMPT`.
- Implemented `roles/coder.ts` with `CODER_DEFAULT_PROMPT` for Stage 1 code generation within strict file boundaries and diff outputs.
- Created `roles/index.ts` central barrel export hub.
- Added automated role and prompt assembly test suite in `interface/src/test-roles.ts`.
- Refactored `Chat.tsx` and `app.tsx` with fixed-row line budgeting and pre-wrapping, resolving text collisions and smooth line scrolling.

### v0.0.6 — October 9, 2026
#### Added
- Implemented `state/relay.ts` for the `task-relay.tmp` file handshake protocol (Role writes → Documenter passive copy → Documenter confirms → Manager clears).
- Defined strongly-typed JSON schema in `state/relay.ts` for 5 handoff cases: `role_output`, `role_brief`, `planning_output`, `role_skipped`, `failsafe_handoff`.
- Implemented `roles/documenter.ts` with `documenterPassiveCopy` generating compact, accountant-style meeting minutes appended to `raw.log`.
- Updated `roles/index.ts` to export Documenter for full system access.
- Confirmed full integration with automated typecheck passing.

### v0.0.7 — October 10, 2026
#### Added
- Implemented `test-e2e.ts` automating the complete E2E task pipeline lifecycle (Manager → Coder → Documenter).
- Verified `task-relay.tmp` file handshakes function as expected, triggering Documenter's passive `raw.log` creation upon completion of a worker role task.
- Validated integration between the Node.js TypeScript queue and the native Go engine execution via stdio JSON bridge.

### v0.0.8 — October 11, 2026
#### Added
- Implemented native Go hardware and environment scanner in `engine/scanner/scanner.go`.
- Added hardware detection for total and available system RAM, CPU cores, GPU/VRAM, and disk storage.
- Implemented runtime port probing for active local model engines: Ollama (`11434`), LM Studio (`1234`), and llama.cpp (`8080`).
- Added `hw_scan` action and JSON bridge payload contracts in `interface/src/types/bridge.ts` and `engine/main.go`.
- Added debounced hardware scanning triggers and atomic scanning lock (`isScanningRef`) in `useRoles.ts`.

### v0.0.9 — October 12, 2026
#### Added
- Implemented model catalog discovery querying active local runtime endpoints and scanning local filesystem for `.gguf` model weights.
- Implemented resource-aware recommendation engine in `interface/src/services/recommendation.ts`.
- Added dynamic model fitting algorithms evaluating parameter sizing against detected system RAM and VRAM.
- Added system health advisories (`buildSystemAdvisories`) including high memory warnings and browser closing suggestions when available RAM is constrained.
- Added starter model recommendations with exact installation and download commands tailored to the host OS (Windows, macOS, Linux).

### v0.0.10 — October 13, 2026
#### Added
- Integrated model catalog and hardware detection directly into `/agent roles` and the CLI interface.
- Implemented transparent background inference server lifecycle management with the `/server stop` slash command to release background process memory.
- Added active server indicator badges in `/agent roles` header (`[Server active: Ollama (11434)]`).
- Decoupled Layer 1 security limits (`LAYER_1_SYSTEM_PROMPT_RULES`) from stored configuration files (`config.json`, `custom-roles.json`), connecting them dynamically at runtime via `assembleTaskPrompt()` to prevent tampering.

### v0.0.11 — October 14, 2026
#### Added
- Full interactive `/roles` and `/agent roles` management terminal screen using Ink.
- Restored full 5-Step Custom Role Creation Wizard per Claude Doc 21 (Name, Function, Agent Assignment with Detected Models sub-dropdown, Base Prompt, Custom Instructions).
- Bidirectional wizard navigation using Left and Right arrow keys for input review.
- Borderless terminal aesthetic across all views (`roster`, `drilldown`, `switch_agent`, `wizard`, `edit_prompt`, `input_text`, `color_palette`).
- Multi-line role prompt editor with smooth arrow/touchpad scrolling, floating visual scrollbar rail, active line tracker (`>`), and character cursor (`█`).
- Main interface cleanup: removed outer chat box border, relocated mode indicator (`[PLAN]` / `[BUILD]`) into the top of the sidebar, added idempotent `/build` and `/plan` slash commands, and updated `/help` with the `Tab` shortcut.
- Anti-collapse layout: implemented windowed scrolling for roster and drilldown actions with `flexShrink={0}`.
- Isolated tab-scoped feedback messages with 3.5s auto-dismiss timers, dedicated 1-line slots, and responsive layout adapting so shortcuts never get pushed off screen.
- Formatted model download commands as separate bullet points below each recommendation.

### v0.0.12 — October 15, 2026
#### Added
- Dedicated `/prompt` system: interactive `PromptRolePicker` role selector with real-time prompt previews, word counts, and direct `/prompt <role>` / `/<role> prompt` bypass shortcuts.
- Interactive `PromptEditor` enforcing 300-word constraint with reactive color-coded word thresholds, forward-delete ANSI compatibility (`\x1b[3~`), borderless design, and newline support.
- Architectural terminology standardization: fully purged legacy `customInstructions` and `currentPrompt` across all role definitions, bridge schemas, and `.vecta` stores, establishing `defaultPrompt` (immutable system identity) and `prompt` (user-editable instructions) as the canonical contract.
- Visual Color Picker Wheel for role colors in `/agent roles`: 12-hue ANSI color wheel with 3 responsive presets (`large`, `medium`, `compact`), 100%-0% darkness dial with indicator `◀`, real-time HEX (`#RRGGBB`), RGB (`R, G, B`), and HSL (`H, S, L`) interactive inputs with Tab cycling and live conversion, and a live chat preview line.
- Native Windows Keyboard Modifier Monitor: implemented native Go helper `keymonitor.go` polling Win32 `GetAsyncKeyState` compiled to `keymonitor.exe`, paired with multi-path candidate resolution in `keyboard.ts`, enabling universal `Shift + Enter` multi-line newlines in terminal chat across Windows, macOS, and Linux while strictly ignoring `Ctrl + Enter`.
- Responsive layout and zero-collapse text wrapping: unified `<Text wrap="wrap">` blocks for titles, live previews, notes, and footers, preventing Yoga flex-shrink text crushing on terminal resize. Added responsive 3-tier input box layouts, responsive wheel gaps, and bounded touchpad / mouse wheel scrolling.
- Updated Windows build pipeline `source/scripts/build.ps1` to automatically build `keymonitor.exe` into `dist/helpers/`.
- Appended `(Press Tab To Switch)` next to `MODE` in `Sidebar.tsx` and updated README Kanban milestones.

### v0.0.13 — October 16, 2026
#### Added
- **Disk-Backed Chat & Project Storage Service (`source/interface/src/services/chat-service.ts`):**
  - Fully persistent CRUD operations for chat histories and project workspaces isolated in `.vecta/chats/[chat-id]/` (`meta.json`, `messages.json`) and `.vecta/projects/[project-id]/` (`meta.json`).
  - Indexing systems (`.vecta/chats/index.json` and `.vecta/projects/index.json`) with sorting (pinned items prioritized, then descending by `updatedAt`).
  - Safe project teardown: deleting a project automatically disassociates child chats to standalone status, ensuring zero loss of chat histories.
  - Chat directory cleanup on deletion removing on-disk artifacts cleanly.
- **Interactive `/chats` Overlay (`source/interface/src/commands/chats.tsx`):**
  - Option 0 always dedicated to `+ New chat` with inline title entry or default instant timestamp creation.
  - Displays standalone and project-scoped chats with `[PIN]` tags, `(current)` active badge, message counters, and formatted compact dates (`Today, ...`, `Yesterday, ...`, `Oct 16, ...`).
  - Full keyboard shortcuts: `Up`/`Down` navigation, `Enter` to open/create, `p` to toggle pin status, `r` for inline renaming, `d` for double-tap deletion confirmation, and `Esc` to close or return.
  - Borderless UI with windowed scrolling for short viewports (< 24 lines) without text collapse.
  - Strict zero-emoji compliance.
- **Interactive `/projects` Overlay (`source/interface/src/commands/projects.tsx`):**
  - Option 0 always dedicated to `+ New project` with inline naming buffer.
  - Lists workspace containers with `[PIN]` badges and live child chat counters `(X chats)`.
  - Workspace drill-down: pressing `Enter` on a project transitions into project-scoped `/chats` view.
  - Project-scoped chat creation: new chats created within a project workspace automatically link `projectId`.
  - Nested back-navigation: `Esc` inside project workspace returns cleanly to project list, while `Esc` at the root project list exits the overlay.
- **Persistent Session State Hook (`source/interface/src/hooks/useSession.ts`):**
  - Synchronous hydration on application startup loading the latest active chat and its complete message history.
  - Automatic disk persistence on every incoming user message and agent role response.
  - Instant session switching upon chat selection in `/chats` or `/projects`.
- **Enhanced Layout & Table Columns for `/chats` and `/projects`:**
  - Separated `/chats` into distinct **"General Chats"** (3 columns: Name, Messages, Last Edited) and **"Project Chats"** (4 columns: Name, Project, Messages, Last Edited).
  - Aligned `/projects` list into consistent 3 columns (Name, Chats active, Last Edited).
  - Responsive line wrapping: metadata cleanly wraps onto indented line 2 (`marginLeft={3}`) on narrow viewports (< 70 for 3-col, < 85 for 4-col) without horizontal clipping.
  - Decoupled touchpad scrolling: touchpad and mouse wheel scroll the page viewport and scrollbar rail without moving selection; arrow keys navigate items and auto-scroll.
  - Shuffled alphanumeric unique IDs: randomized hashes for chats (`chat_...`) and projects (`proj_...`).
  - Flexible project deletion: double-tap `d` offers `[d]` cascade delete project and child chats vs. `[s]` delete project container but preserve child chats as standalone.
  - 24-hour edit window date formatting: relative times (`Just now`, `Xm ago`, `Xh Xm ago`) within 24 hours; exact calendar day (`Oct 16`, `Oct 16, 2025`) once past 24 hours.
  - Zero emojis compliance across all UI components, status badges, and logs.
- **Interactive `/queue` Modal Dialog & Pipeline Visualizer (`source/interface/src/commands/queue.tsx` & `source/interface/src/components/QueueModal.tsx`):**
  - **Pipeline Execution Chain:** Renders the active multi-stage sequence assembled by Manager (`Manager -> Coder -> Code Reviewer -> Documenter`) highlighted in configured role colors. Documenter is strictly last and non-wrapping (`flexShrink={0}`).
  - **Execution Queue Task List:** Displays live status badges (`[✓]` done, `[●]` active, `[ ]` queued, `[✗]` error), Stage indicator `[Stage X]`, duty prompt summaries, and consumed token counters.
  - **Task Inspector Section:** Clean line-by-line breakdown displaying role, assigned model and type (`[local]` / `[cloud]`), execution status with duration/progress indicator, Layer 1 boundary restrictions (`source/` containment enforced by Go engine), prompt instructions, and output summary.
  - **Conditional Scrollbars & Responsiveness:**
    - Dynamic scrollbar rail (`█` thumb) renders on the task list **if and only if** tasks exceed the container.
    - Dedicated scrollbar rail renders on the task inspector **if and only if** detail content exceeds container height.
    - Full cross-platform touchpad / mouse wheel and `PgUp`/`PgDn` support.
  - **Keyboard Ergonomics:** `Ctrl+Q` global shortcut from chat area, `/queue` slash command with autocomplete, `Esc` to close modal, and status bar hint `[Ctrl+Q] Queue`.
- **UI Integration & Autocomplete (`Chat.tsx`, `app.tsx`, `help.tsx`, `StatusBar.tsx`):**
  - Registered `/chats`, `/projects`, and `/queue` in `BASE_SLASH_COMMANDS` dropdown autocomplete.
  - Integrated `/chats`, `/projects`, and `/queue` into `/help` command output cheatsheet and `help.tsx`.
  - Wired full-screen overlay routing in `app.tsx`.
  - Updated status bar shortcut hint to `[Ctrl+Q] Queue`.

### v0.0.14 — October 17, 2026
#### Added
- **Multi-Tier Memory Engine (`source/state/memory.ts` & `source/interface/src/hooks/useMemory.ts`):**
  - Fully implemented Sprint Plan §2E three-file memory model: Tier 1 `general.json` (global preferences across all chats), Tier 2 `CCM.json` (per-scope Cross-Chat Memory: General scope + Project scopes), and Tier 3 `summary.json` (per-chat rolling narrative + bullet Key Points).
  - Enforced word cap limits per Sprint Plan §5 & Claude Docs 12 & 13: strict 700-word cap on cross-chat narratives and 350-word cap on per-chat summaries.
  - CRUD operations for Tier 1 Global Preferences (read, add, update, remove).
  - CRUD operations for Tier 2 Scoped CCM (scope discovery, Key Points add/remove, narrative update).
  - CRUD operations for Tier 3 Chat Summaries.
  - Reactive hook `useMemory.ts` synchronizing memory states across UI views.
- **Interactive `/memory` Overlay (`source/interface/src/commands/memory.tsx`):**
  - Scope list view rendering structured table columns (Scope Name, Key Points, Narrative Words, Last Updated) for Global Preferences, General scope, and all active project workspaces.
  - Scope detail inspector separating permanent Key Points (`a` add inline, `d`/`dd` double-tap delete) from rolling cross-chat narrative (`e` edit inline with word count threshold alerts).
  - Global Preferences view for reviewing and modifying global rules.
  - Clean UI design: borderless styling, conditional scrollbar rail (`█` thumb) appearing only upon viewport overflow, decoupled touchpad / mouse wheel scrolling, tab-scoped feedback messages (3.5s auto-dismiss), and authoritative `Esc` navigation.
- **Global Configuration Store & `/settings` Screen (`source/state/config.ts` & `source/interface/src/commands/settings.tsx`):**
  - Centralized `.vecta/config.json` configuration manager with self-healing defaults.
  - Interactive `/settings` menu with Up/Down selection, Enter/Space toggling and cycling, and inline username buffer editing with character cursor (`█`).
  - Configurable settings: visual theme (default, cyan, royal, amber, emerald, matrix), raw log size cap (64MB, 128MB, 256MB, 512MB, 1024MB per Sprint Plan §2H), auto-delete interval (1w, 2w, 4w, disabled per Sprint Plan §2I), task timeouts (5m, 10m, 15m, 30m), and token warning caps (x notation vs. raw numbers).
  - Layer 2 Safety Toggles per Claude Doc 17: require confirmation before file write, roles talk directly, and show role thinking.
  - Inline navigation shortcuts into `/agent roles` and `/memory`.
- **UI Shell Polish & Autocomplete Integration (`Chat.tsx`, `app.tsx`, `help.tsx`):**
  - Registered `/memory` and `/settings` in `BASE_SLASH_COMMANDS` dropdown autocomplete in `Chat.tsx`.
  - Registered `/memory` and `/settings` in `/help` cheatsheet command index and `help.tsx`.
  - Wired full-screen overlay routing in `app.tsx`.
- **Quality Assurance & Verification:**
  - Automated test script `source/interface/src/test-memory-settings.ts` ran 6 comprehensive lifecycle tests verifying config defaults, mutations, Global Preferences CRUD, Scoped CCM with 700-word cap, Chat Summaries with 350-word cap, and scope listing. All 6 passed cleanly.
  - TypeScript compilation (`tsc --noEmit`): clean exit 0.
  - Production bundle build (`esbuild`): bundle generated `dist/main.js` (1.7MB) with 0 errors.
  - Zero emojis compliance across all interface files.

### v0.0.15 — October 18, 2026
#### Added
- **`manager-duties.json` Two-Layer State Architecture (`source/state/manager-duties.ts`):**
  - Isolated per-chat at `.vecta/chats/[chat-id]/manager-duties.json`.
  - Layer 1 (Permanent Base Duties): Initialized write-once at chat creation with Manager's 9 canonical core duties extracted from `source/roles/manager.ts`. Protected against modification and truncation.
  - Layer 2 (Rolling Session Context): Stores chronological session observations, decisions, and breadcrumbs. Automatically compacts oldest non-essential items when length exceeds 50 entries.
  - Failsafe Briefing Engine (`getDutiesForFailsafe`): Combines Layer 1 duties with Layer 2 session context for role handoff if Manager times out or fails (Claude Doc 09).
  - Hardened with strict `chatId` sanitization against path traversal (BUG-004).
- **Documenter Handshake & Passive Raw Log Recorder (`source/roles/documenter.ts`):**
  - Accountant-style passive recording (`documenterPassiveCopy`) appending meeting-minute summaries and files-touched audits to `.vecta/chats/[chat-id]/raw_[scramble].log` using standard logfmt formatting (`ts=... lvl=... role=... task=... msg=...`).
  - Filename scramble generation matching project and chat naming conventions (`raw_[random].log`) with automatic fallback discovery.
  - Handshake confirmation signal (`DocumenterConfirmation`) with SHA-256 integrity hash, byte count, timestamp, and audit metadata.
  - Official turn summary generator (`documenterOfficialTurn`) producing clean markdown turn summary for chat UI and extracting Key Points for memory.
  - Added `getRawLogSize()` and `getRawLogEntries()` with logfmt parser for monitoring log growth against config limits (256MB).
- **Interactive `/memory` & `/settings` Polish Pass (`memory.tsx`, `settings.tsx`, `useMemory.ts`):**
  - **Two-Tab `/memory` Architecture (Claude Docs 12 & 13):** Tab 1 (Default: **Chats**) lists individual chat sessions with permanent Key Points and rolling 350-word `summary.json` Chat Summaries. Tab 2 (**Cross Chat**) houses Global Preferences, General CCM, and Project CCMs (700-word cross-chat narrative). Tabs toggle instantly with `Tab` or `←`/`→`.
  - **Seamless Navigation & Direct `Enter` Editing:** Removed `Tab` section jumping and `'e'` editing shortcuts. Users navigate seamlessly between Key Points and Narrative with `Up`/`Down` arrows; pressing `Enter` directly edits whatever item the `>` cursor is over. Section headers light up (`cyan` bold) to indicate active focus.
  - **Enter & Esc Save Workflow:** In all memory text input overlays, plain `Enter` or `Esc` immediately saves and exits, while `Shift+Enter` inserts newlines.
  - **Collapsing Bullet Points:** Across all Key Points and Global Preferences, items render with bullet points (`• `) when inactive. When selected by the cursor (`> `), the bullet point cleanly collapses; when moving away, it re-emerges with zero column jitter.
  - **Dynamic Responsive Horizontal Lines:** Borderless input canvas dynamically hugs text lines (`height={Math.max(1, visibleLines.length)}`). When 1 line of text is entered, horizontal lines tightly sandwich that line; as lines expand with `Shift+Enter` (2, 3+ lines), the bottom line dynamically follows, matching `prompt-editor.tsx`.
  - **Footer Structure Matching `/roles`:** Standardized horizontal line separator (`─`) and shortcut status footer pinned to the bottom of all memory screens.
  - **Custom Numerical Input (`'c'` key in `/settings`):** Added modal enabling arbitrary numeric inputs with `Tab` unit cycling (`[KB] [MB] [GB]`, `[days] [weeks]`, `[seconds] [minutes] [hours]`) and automatic conversion formatting (e.g. 1024 MB displayed as "1 GB (Ring buffer)").
  - **Memory Input UX & Terminology Clean-Up:** Borderless input area matching `PromptEditor` with `> ` active line indicator, inverted character cursor, `Shift+Enter` multi-line support, and `Esc` auto-save. Removed all internal "Tier 1", "Tier 2", or "layer" terminology from UI, displaying `# key points` and `# words`.
  - **Stability & Performance:** Memoized `useMemory` hook return object, resolving infinite re-render flickering and CCM glitching.
- **Task Relay Handshake Enforcement (`source/state/relay.ts`):**
  - Handshake token verification (`recordDocumenterConfirmation()` and `isRelayConfirmedByDocumenter()`).
  - Sprint Plan §2E & Claude Docs 08/11 invariant enforcement: `clearRelay()` throws an error if Manager attempts to clear `task-relay.tmp` before Documenter confirms copy to `raw.log`.
  - Sanitized file paths across all relay routines using `path.basename`.
- **Chat Creation & Queue Pipeline Integration (`chat-service.ts`, `useQueue.ts`, `useSession.ts`, `app.tsx`):**
  - **Blank Chat On Launch:** CLI startup always opens to a clean, blank standalone chat without writing to disk or auto-loading stale chats.
  - **On-Message Official Chat Creation:** The moment the user sends their first prompt, the chat is officially instantiated on disk (`.vecta/chats/[chat-id]/`), titled from the prompt, and assigned an ID.
  - **Blank Chat Command (`/new`):** Reset to a blank standalone chat at any time.
  - Chat initialization automatically writes `manager-duties.json` on disk from the start of every chat.
  - Task execution pipeline in `useQueue.ts` writes outputs to `task-relay.tmp`, runs Documenter's passive copy to `raw_[scramble].log`, verifies confirmation, clears relay, and appends context breadcrumbs to `manager-duties.json`.
  - Passed `session.activeChatId` from `app.tsx` into `dispatchPipeline()`.
- **Quality Assurance & Verification:**
  - Automated test suite `source/interface/src/test-oct18-documenter-handshake.ts` covering 7 test scenarios (Layer 1 immutability, Layer 2 appending/compaction/failsafe briefing, passive copy to scrambled raw log in logfmt format, complete handshake lifecycle, handshake security violation prevention, official turn generation, and settings formatters). All 7 passed cleanly.
  - TypeScript compilation (`tsc --noEmit`): clean exit 0.
  - Production bundle build (`esbuild`): bundle generated `dist/main.js` (1.8MB) with 0 errors.
  - Strict zero-emoji compliance.
