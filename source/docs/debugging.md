# Vecta Debugging Triage Log

> Living triage document for tracking active bugs, causes, symptoms, and verified resolutions.
> Stays on `dev` branch — entries can be archived once confirmed fixed.

---

## Resolved Issues

### ISSUE-001: Missing Node.js Type Definitions in TypeScript Interface
- **File:** `interface/src/helpers/paths.ts`
- **Symptom:** Editor reported `Cannot find name 'process'`, `Cannot find module 'node:path'`, and `Cannot find name '__dirname'`.
- **Root Cause:** `@types/node` was missing from `devDependencies` in `interface/package.json`, and modern Node ES Modules require URL resolution for `__dirname`.
- **Resolution:**
  1. Installed `@types/node` in `interface/package.json`.
  2. Implemented `fileURLToPath(import.meta.url)` in `paths.ts` for cross-platform ESM directory resolution.
  3. Added `"types": ["node"]` to `interface/tsconfig.json`.

### ISSUE-002: Deprecated `baseUrl` with Bundler Module Resolution
- **File:** `interface/tsconfig.json`
- **Symptom:** TypeScript flagged deprecation warning on Line 15 (`baseUrl: "."`).
- **Root Cause:** TypeScript 5.0+ deprecates `baseUrl` when `"moduleResolution": "bundler"` is selected because path aliases resolve directly relative to the tsconfig file.
- **Resolution:** Removed `"baseUrl": "."` and mapped `@roles/*`, `@state/*`, and `@interface/*` paths directly.

### ISSUE-003: Task ID Collision Causing Infinite Repeat Loop
- **File:** `state/session.ts`, `interface/src/hooks/useQueue.ts`, `interface/src/app.tsx`
- **Symptom:** Submitting a prompt repeatedly or running subsequent tasks caused Frontend Engineer / Coder to loop infinitely.
- **Root Cause:** Hardcoded static task IDs (`"task-01"`, `"task-02"`) caused `sessionManager.updateStatus()` to match and update stale completed tasks from prior runs, leaving new tasks in a permanent `"pending"` state inside the `while` loop.
- **Resolution:** 
  1. Generated unique timestamped task IDs per dispatch (`task-${Date.now()}-1`).
  2. Added queue reset logic in `useQueue.ts` on new pipeline runs.
  3. Scoped `updateStatus()` to target active/pending tasks matching the ID.


---

## Active Codebase Bug Audit (October 13, 2026)

> Triage log for active bugs identified during the full repository audit. Categorized by severity: Major, Medium, and Minor.

### Major Severity Bugs

#### BUG-001 (Major): The 64KB IPC Scanner Crash
- **Location:** `source/engine/main.go`
- **Symptom:** Go engine terminates abruptly and exits without warning during large chat context, massive prompt relay, or large file transfers.
- **Root Cause:** Go's `bufio.NewScanner` defaults to `bufio.MaxScanTokenSize` (64 KB). Lines exceeding this buffer cause `scanner.Scan()` to return `false` with `bufio.ErrTooLong`, causing `main()` to exit immediately.
- **Fix:** Expand scanner capacity using `scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)` to support up to 16 MB lines, with long-term migration to a Length-Prefixed Protocol.
- **Status:** Resolved & Verified (Oct 13, 2026) — Expanded buffer to 16 MB in `main.go`.

#### BUG-002 (Major): TypeScript Promise Deadlock on Bridge Parse Failure
- **Location:** `source/engine/main.go` & `source/interface/src/bridge/client.ts`
- **Symptom:** The interface hangs permanently when sending an invalid or malformed JSON payload.
- **Root Cause:** If `json.Unmarshal` fails in Go, `sendError("", ...)` returns an empty ID `""`. The TS client attempts to resolve `this.pendingRequests.get("")`, finding `undefined`. The original Promise remains pending indefinitely.
- **Fix:** Go must extract the request ID before returning an error, or echo a fallback ID. The TS client must enforce request timeouts (e.g., 30s) on all pending bridge requests.
- **Status:** Mitigation Active (Oct 13, 2026) — Added 60s request timeout watchdog in `client.ts` to prevent Promise deadlocks.

#### BUG-003 (Major): Bundled Production Binary Path Resolution Failure
- **Location:** `source/interface/src/bridge/client.ts`
- **Symptom:** Running the compiled production bundle (`dist/main.js`) throws `Go engine binary not found`.
- **Root Cause:** `getEngineBinaryPath()` uses `path.resolve(__dirname, "..", "..", "..", "engine", binaryName)`. In TypeScript source mode (`src/bridge/`), this resolves to `source/engine/`. In bundled mode (`dist/main.js`), `__dirname` is `dist/`, resolving to `<repo>/engine/` instead of `source/engine/`.
- **Fix:** Check multiple path candidates (`source/engine` and `engine`) or leverage standard environment overrides via `getVectaDir()`.
- **Status:** Resolved & Verified (Oct 13, 2026) — Implemented multi-candidate path resolution in `client.ts`.

#### BUG-004 (Major): Path Traversal via Chat ID in task-relay.tmp
- **Location:** `source/state/relay.ts`
- **Symptom:** Arbitrary file reads or writes outside the intended chat directory.
- **Root Cause:** File paths are constructed using direct string joins: `path.join(getVectaDir(), "chats", chatId, "task-relay.tmp")`. An unvalidated `chatId` containing relative traversal sequences (`../../`) allows escaping the chat directory.
- **Fix:** Sanitize `chatId` using `path.basename(chatId)` and reject paths containing path separators.

---

### Medium Severity Bugs

#### BUG-005 (Medium): Queue Concurrency Blocking During Execution
- **Location:** `source/engine/main.go`
- **Symptom:** Engine is unresponsive to `ping`, `hw_scan`, or cancel signals while a role task executes.
- **Root Cause:** `handleRequest` processes `queue_dispatch` synchronously on the scanner thread. The `scanner.Scan()` loop is blocked until `ExecuteTask` returns.
- **Fix:** Dispatch task execution to background goroutines with mutex-guarded channel writes to standard output.

#### BUG-006 (Medium): Pipeline Error Bleed on Task Failure
- **Location:** `source/interface/src/hooks/useQueue.ts`
- **Symptom:** If an early pipeline step (e.g. Coder) fails, subsequent steps (Code Reviewer, Documenter) continue running on broken or non-existent code.
- **Root Cause:** The `while (true)` loop in `dispatchPipeline` marks the task status as `"error"` but lacks a `break;` statement.
- **Fix:** Add an immediate `break;` upon detecting task error status.

#### BUG-007 (Medium): Sandbox Boundary Prefix Matching Bypass
- **Location:** `source/engine/queue/queue.go`
- **Symptom:** File operations bypass directory sandbox restrictions.
- **Root Cause:** Boundary checks use `strings.HasPrefix(cleanTarget, cleanBoundary)`. A target path like `/app/source_secrets` passes a boundary check for `/app/source` because it matches the prefix string.
- **Fix:** Use `filepath.Rel()` and verify `!strings.HasPrefix(rel, "..") && rel != ".."` to mathematically verify directory nesting.

#### BUG-008 (Medium): Scanner Silent Termination Without Error Logging
- **Location:** `source/engine/main.go`
- **Symptom:** Engine subprocess dies with exit code 0 without writing diagnostic information.
- **Root Cause:** After the `for scanner.Scan()` loop terminates, `main()` returns without checking `scanner.Err()`. Buffer overflows, unexpected EOF, or broken pipes exit silently.
- **Fix:** Add `if err := scanner.Err(); err != nil { fmt.Fprintf(os.Stderr, "Engine fatal error: %v\n", err) }` after the scan loop.
- **Status:** Resolved & Verified (Oct 13, 2026) — Added `scanner.Err()` fatal logging in `main.go`.

---

### Minor Severity Bugs

#### BUG-009 (Minor): Session Task ID Collision Under Rapid Dispatch
- **Location:** `source/state/session.ts`
- **Symptom:** Incorrect task status updates during rapid programmatic submissions.
- **Root Cause:** `taskId`s rely on `Date.now()`. Tasks generated in the same millisecond receive duplicate IDs. `sessionManager.updateStatus` uses `.find()`, updating only the first instance.
- **Fix:** Use `crypto.randomUUID()` for task ID generation.

#### BUG-010 (Minor): Windows Drive Letter Case-Sensitive Boundary Mismatch
- **Location:** `source/engine/queue/queue.go`
- **Symptom:** Valid file paths on Windows fail boundary checks due to drive letter casing (`C:\` vs `c:\`).
- **Root Cause:** Windows filesystems are case-insensitive, but Go string comparisons are case-sensitive.
- **Fix:** Normalize paths with `strings.ToLower()` on Windows before comparing boundary strings.

#### BUG-011 (Minor): Terminal Screen Tearing via Raw Stderr Writing
- **Location:** `source/interface/src/bridge/client.ts`
- **Symptom:** Visual glitches and displaced text in the Ink terminal canvas.
- **Root Cause:** Go's `stderr` output is piped directly to `console.error()`, bypassing Ink's virtual layout tree and disrupting terminal cursor calculations.
- **Fix:** Intercept `stderr` and route messages into the Chat state or debug log.

#### BUG-012 (Minor): Slash Command Pass-Through to AI Prompt
- **Location:** `source/interface/src/app.tsx`
- **Symptom:** Typing `/agent roles`, `/help`, or `/prompt` dispatches an LLM task instead of opening the command screen.
- **Root Cause:** `handleUserPrompt` only checks for `/exit` and `/quit`; all other slash commands pass directly into the pipeline generator.
- **Fix:** Intercept recognized slash commands and route them to view state switchers.
- **Status:** Resolved & Verified (Oct 13, 2026) — Intercepted recognized slash commands in `app.tsx`.

#### BUG-013 (Major): Security Rules Leaked into Editable Configuration Files
- **Location:** `source/roles/`, `source/interface/src/hooks/useRoles.ts`, `.vecta/config.json`, `.vecta/custom-roles.json`
- **Symptom:** Plain-text `[VECTA LAYER 1 CORE SECURITY RULES - ALWAYS ACTIVE]` blocks appeared inside `.vecta/config.json` and `.vecta/custom-roles.json`, allowing users or external editors to tamper with or delete core Layer 1 safety rules in plain JSON files.
- **Root Cause:** Role default prompts concatenated `LAYER_1_SYSTEM_PROMPT_RULES` directly into `defaultPrompt`, which was duplicated into `currentPrompt` and serialized into `.vecta/` configuration files on disk.
- **Fix:** Stripped `LAYER_1_SYSTEM_PROMPT_RULES` from role definition constants and serialization payloads. Layer 1 security limits are now hardcoded in code and dynamically connected exclusively at runtime via `assembleTaskPrompt()` in `base.ts`. Plain configuration files on disk now only store clean role identity and user custom instructions (max 300 words). Stored files on disk are automatically sanitized on load.
- **Status:** Resolved & Verified (Oct 13, 2026) — Decoupled Layer 1 rules from role files and storage payloads, verified with `test-roles.ts`.

#### BUG-014 (Medium): Custom Role Creation Wizard State Lock & Escape Routing
- **Location:** `source/interface/src/commands/agent-roles.tsx`
- **Symptom:** When adding a custom role from the `/roles` screen, typing a name and pressing Enter did nothing and failed to advance. Pressing Escape returned the user to the previously selected role's drilldown view instead of the roster.
- **Root Cause:** The `input_text` view required `activeRole` to be non-null and only handled `api_key`, `custom_path`, and `custom_name` actions. It had no branches for `wizard_name` or `wizard_desc`. Furthermore, the Escape key unconditionally routed to `setView("drilldown")`.
- **Fix:** Added dedicated branches for `wizard_name` and `wizard_desc` that properly advance to the description step and invoke `hook.addCustomRole()`. Updated Escape key handler to return to `"roster"` when in wizard mode.
- **Status:** Resolved & Verified (Oct 13, 2026) — Verified custom role creation wizard advances and creates custom roles cleanly.

#### BUG-015 (Minor): Checkers Text Row Collapse & Redundant Fit Badge
- **Location:** `source/interface/src/commands/agent-roles.tsx`
- **Symptom:** Checkers roster lines collapsed words onto multiple lines when role name, on/off status, and autonomy badges collided. Additionally, unassigned roles displayed redundant `No Model (No Model)` or `No Agent (No Model)` text.
- **Root Cause:** Roster rows lacked `flexDirection="row"`, fixed name column width was too narrow (`width={22}`), and `getFitBadge` returned `"(No Model)"` for roles with model set to `"No Model"` or `"No Agent"`.
- **Fix:** Increased column width to `width={28} flexShrink={0}` with `flexDirection="row"` across all roster rows, and updated `getFitBadge` to return an empty string for unassigned models. Renamed display terminology to `"No Agent"`.
- **Status:** Resolved & Verified (Oct 13, 2026) — Verified zero text wrapping and clean badge display.

#### BUG-016 (Minor): Inexact Typing Cursor Tracking in Prompt Editor
- **Location:** `source/interface/src/commands/agent-roles.tsx` (`edit_prompt` screen)
- **Symptom:** In the role prompt editor (`edit_prompt`), the typing cursor block (`█`) does not exactly track the character position as the user types across multi-line text (whereas in other text inputs like the wizard and chat it follows smoothly).
- **Root Cause:** In `edit_prompt`, the prompt is split into multi-line wrapped rows with a line-level pointer (`promptLineCursor`), but character-level cursor offset tracking (`cursorCol` or inline character cursor) within the active line is not calculated per character, resulting in an inexact cursor position while editing.
- **Fix:** In progress — implement granular character-level offset calculation for the multi-line editor buffer.

#### BUG-017 (Major): Active Chat Memory State Leak After Chat or Project Deletion
- **Location:** `source/interface/src/commands/chats.tsx`, `source/interface/src/commands/projects.tsx`, `source/interface/src/hooks/useSession.ts`
- **Symptom:** When a user deletes the currently active chat in `/chats`, or deletes a project containing the active chat in `/projects` (via Option A 'd'), the chat files on disk are removed, but `session.activeChatId` remains set in memory. Sending a subsequent message causes `addMessage` to attempt writing messages to the deleted folder or orphan `meta.json`, causing corrupt state and broken session persistence.
- **Root Cause:** Deletion callbacks in `chats.tsx` (`mode === "confirm-delete"`) and `projects.tsx` do not check if `targetChat.id === activeChatId` or `targetProj.chatIds.includes(activeChatId)`. They fail to notify `useSession` or call `session.startBlankChat()`.
- **Fix:** In `chats.tsx` and `projects.tsx`, detect if `activeChatId` was removed; if so, trigger a callback to reset `session.startBlankChat()`.

#### BUG-018 (Medium): Project Renaming Inconsistency Across Memory Scopes
- **Location:** `source/interface/src/services/chat-service.ts`, `source/state/memory.ts`
- **Symptom:** Renaming a project in `/projects` updates `projects/index.json` and `meta.json`, but does not update `scopeName` in `.vecta/projects/[projectId]/CCM.json`. Navigating to `/memory` continues to display the stale project name until manually edited.
- **Root Cause:** `chatService.renameProject` modifies only `meta.json` and `projects/index.json`. It does not propagate the updated name into the project's CCM file or memory cache.
- **Fix:** Update `renameProject` to check if `.vecta/projects/[projectId]/CCM.json` exists; if so, update its `scopeName` property in tandem, or trigger `memoryService.renameProjectScope(projectId, newName)`.

#### BUG-019 (Medium): Unconstrained Numerical & String Input Overflow in Settings Modals
- **Location:** `source/interface/src/commands/settings.tsx`
- **Symptom:** Typing or pasting an excessively long number (>15 digits) into the Custom Number input modal (for raw log cap, inactivity auto-delete, or role timeout) or typing a very long username (>100 characters) causes floating-point overflow (`Infinity`/`NaN`), distorted timeout arithmetic (`val * 3600`), and horizontal visual wrapping that tears the Ink terminal canvas.
- **Root Cause:** Input handlers in `settings.tsx` append characters to `customNumber.buffer` and `usernameBuffer` without length constraints, and parse values without bounds checking (e.g. min 1, max 1,000,000).
- **Fix:** Constrain `customNumber.buffer` to max 8 characters and validate numeric range (e.g., 1 to 1048576 for logs, 1 to 520 for weeks, 5 to 86400 for seconds). Constrain username to max 32 printable characters.

#### BUG-020 (Medium): Child Process Tree Leak on Windows Go Engine Termination
- **Location:** `source/interface/src/bridge/client.ts`
- **Symptom:** When exiting Vecta or calling `engineBridge.stop()`, background worker processes or grandchild processes spawned by the Go engine or local inference wrappers continue running in the background, consuming CPU and RAM.
- **Root Cause:** `engineBridge.stop()` executes `this.process.kill()`. On Windows (`win32`), Node.js `child_process.kill()` sends `SIGTERM`/`TerminateProcess` strictly to the top-level process ID, leaving child subprocesses unkilled as orphaned background zombies.
- **Fix:** On Windows (`process.platform === "win32"`), execute `taskkill /pid ${this.process.pid} /T /F` to kill the entire process tree recursively before nulling the reference.

#### BUG-021 (Medium): Unintercepted Slash Commands Leaking Directly into LLM Pipeline
- **Location:** `source/interface/src/app.tsx`
- **Symptom:** Typing `/clear`, `/lock`, `/usage`, or `/token-weekly` dispatches a full LLM pipeline run with tasks instead of executing the local command or displaying a friendly "feature planned for v0.2.0" notice.
- **Root Cause:** `handleUserPrompt` lacks routing cases for `/clear`, `/lock`, `/usage`, and `/token-weekly`, falling through directly into `addMessage("User", promptText)` and pipeline assembly.
- **Fix:** Add command intercepts in `app.tsx`: `/clear` clears the active message buffer; planned slash commands (`/lock`, `/usage`, `/token-weekly`) output an informative system banner.

#### BUG-022 (Minor): Terminal Height Underflow Rendering Flicker on Compact Screens
- **Location:** `source/interface/src/app.tsx`, `source/interface/src/components/Chat.tsx`
- **Symptom:** When resizing the terminal window below 14 rows, the chat pane and sidebar overflow the terminal buffer, causing high-frequency layout jitter and cursor jumping.
- **Root Cause:** `appHeight` clamps to `Math.max(12, terminalSize.rows - 1)`, but combined header, chat lines, status bar, and input area require a minimum of 14-16 vertical rows. When `terminalSize.rows < 14`, the calculated layout exceeds the terminal viewport.
- **Fix:** Add a compact fallback screen or minimum height guard banner when `terminalSize.rows < 14` (e.g. "Terminal too small (current: N rows, min: 14 rows). Please resize your terminal window.").

#### BUG-023 (Minor): Chat Message ID Float Representation Quirk
- **Location:** `source/interface/src/hooks/useSession.ts`
- **Symptom:** Chat messages generated rapidly have IDs like `"1730000000000.4124"`, which can cause non-deterministic sorting or matching edge cases when serialized into JSON.
- **Root Cause:** `id: String(Date.now() + Math.random())` performs arithmetic addition between a large millisecond timestamp and a decimal fraction.
- **Fix:** Use standard UUID (`crypto.randomUUID()`) or string concatenation `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.

#### BUG-024 (Minor): Offline Ollama Disk Detection Failure Due to Extensionless Blobs
- **Location:** `source/engine/scanner/scanner.go`
- **Symptom:** If the Ollama runtime is stopped/offline (port 11434 closed), none of the downloaded Ollama models on the machine are recognized in the local model catalog.
- **Root Cause:** Ollama stores model weights in `.ollama/models/blobs/` as extensionless SHA256 hashes without `.gguf` extensions. The scanner's `knownExts` filter requires `.gguf`, `.safetensors`, or `.bin`, completely skipping all offline Ollama files on disk.
- **Fix:** In `scanner.go`, parse Ollama manifest files located in `.ollama/models/manifests/` when the Ollama server is offline to detect installed models from disk without requiring the daemon to be running.

---

## Technical Debt & Post-Testing Cleanup (October 23, 2026)

> Triage log for testing workarounds and drive naming fixes applied on Oct 23, 2026, scheduled for systematic cleanup post-testing.

### DEBT-001 (Cleanup): Hardcoded "Seagate" Drive Reference Removal
- **Files Modified:** `source/engine/models/inference.go`, `source/docs/versions.md`
- **Symptom:** When Ollama is offline or a model is missing from disk, Vecta rendered an advisory message specifically requesting a Seagate drive: `Please connect your external model drive (e.g. Seagate D:\)`.
- **Root Cause:** The fallback warning string in `inference.go` (line 176 and 217) hardcoded the vendor name "Seagate" as an illustrative example, causing user confusion when using alternative external drive volumes like Western Digital `Elements (D:)`.
- **Status:** **Patched for Testing.** All occurrences of "Seagate" replaced with generic external drive notation `(D:\)`.
- **Post-Testing Action:** Implement dynamic drive label discovery via Go's `GetVolumeInformationW` on Windows or drive mount enumeration so error messages adapt dynamically to whatever volume label the user's secondary drive possesses (e.g., `Elements (D:)`, `Samsung (E:)`, etc.) rather than assuming any fixed name.

### DEBT-002 (Cleanup): Raw Blob Hash Auto-Resolution Temporary Patch
- **Files Modified:** `source/engine/models/inference.go`
- **Symptom:** Selecting a direct blob file from `D:\OllamaModels\Vecta Model\blobs\` saved the raw SHA-256 digest (`sha256-dde5aa3fc5ffc17176b5e8bdc82f587b24b2678c6c66101bf7da77af9f7ccdff`) as the role model name in `.vecta/config.json`. Ollama's HTTP API `/api/generate` rejected the raw hash string with a model not found error.
- **Root Cause:** Ollama requires friendly model tags (`llama3.2:3b`, `qwen2.5-coder:3b`) rather than internal content-addressable SHA-256 blob digests when invoking `/api/generate`.
- **Status:** **Temporary Workaround Applied.** Added a direct string check mapping `sha256-dde5aa...` to `llama3.2:3b` in `inference.go` to unblock immediate local inference testing.
- **Post-Testing Action:** Remove the hardcoded `sha256-dde5aa` string check. Replace with a generic manifest reverse-lookup utility in Go (`scanner/manifest.go`) that scans the `manifests/` directory on disk, parses the JSON layer digests, and automatically maps any raw SHA-256 blob path back to its registered Ollama model tag.

### DEBT-003 (Cleanup): Synchronized `vecta-default:latest` Tag Alias
- **Files Modified:** `D:\OllamaModels\Vecta Model\manifests-v2\ollama.com\library\vecta-default`
- **Symptom:** Default roles and unassigned pipeline stages requested `vecta-default:latest`, which was originally an alias for `llama3.1:8b` (4.9 GB), causing severe memory paging delays on 8 GB RAM machines.
- **Root Cause:** Prior to testing, `vecta-default:latest` was coupled to the heavier 8B parameter model.
- **Status:** **Synchronized for Testing.** Executed `ollama cp llama3.2:3b vecta-default:latest` so that fallback calls to `vecta-default:latest` execute the fast 2.0 GB 3B model.
- **Post-Testing Action:** Decouple the hardcoded model copy. Implement a first-boot model selection wizard or an explicit user setting in `/settings` that binds `vecta-default` dynamically according to the user's hardware tier (3B for ≤8GB RAM, 8B for 16GB, 14B+ for 32GB+).

### DEBT-004 (Reliability): Device Bridge CLI Workflow Polish & Robust Exception Handling
- **Files Affected:** `source/interface/src/services/device-bridge.ts`, `source/interface/src/app.tsx`, `source/engine/device/device.go`
- **Context:** Mobile device bridge field testing on physical hardware (OnePlus Nord N100) and Android emulators.
- **Symptom:** Disconnecting the USB cable mid-session, ADB daemon state changes, or missed USB debugging authorization prompts can occasionally cause silent disconnects, socket retries, or command delays in the CLI.
- **Status:** **Identified for Systemic Polish.**
- **Action Required:**
  1. **Frictionless CLI Experience for All Users:** Ensure the `/device connect`, `/device disconnect`, and `/device` workflow is completely intuitive, with crystal-clear console guidance when USB Debugging is disabled or pending authorization on the phone.
  2. **Comprehensive Exception Shielding:** Wrap all ADB subprocess executions and HTTP bridge communications with fail-safe error boundaries. A sudden physical unplug must never throw unhandled promise rejections or destabilize the desktop terminal TUI.
  3. **Auto-Recovery & Reconnect Window:** Implement a 10-second grace window upon USB disconnect that pauses active task queue dispatches and resumes automatically when the cable is re-seated.
  4. **Self-Healing ADB Tunnel Daemon:** Automatically detect stale `adb reverse` forwardings and re-establish port mappings on reconnect without requiring manual user commands.
  5. **Single-Plug Wireless ADB Link:** Implement automatic switch to wireless debugging (`adb tcpip 5555` -> `adb connect <device-ip>:5555`) so developers can plug in via USB once to pair, disconnect the cable, and continue monitoring and driving Vecta completely wirelessly over the local network without dropping the active session.







