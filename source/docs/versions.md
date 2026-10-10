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
