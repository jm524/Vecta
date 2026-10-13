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




