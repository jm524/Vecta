# Vecta Development Roadmap & Sprint Master Plan

> The authoritative build roadmap, daily schedule, pre-build gates, cut orders, and contingency plans for shipping the **Congressional App Challenge** demo by **October 26, 2026**.
> Stays on `dev` branch — never merged to `main`.

---

## 1. Pre-Build Gates (Must Exist Before Step 1)

Per `Building/Checklist.md`, these architectural definitions are prerequisites for production coding:
- [x] **`docs/agents.md`** — AI prompt library for TS & Go development.
- [x] **`roles/manager.ts` defaultDuties** — Base Layer 1 duties block for `manager-duties.json`.
- [x] **Role defaultPrompts** — `roles/base.ts` shared interface + prompts for all 9 roles.
- [x] **`task-relay.tmp` schema** — Handshake protocol specified in `docs/functions.md`.
- [x] **`docs/privacy.md` content plan** — User-facing threat model and risk disclosure.

---

## 2. 23-Day Crunch Schedule (Oct 4 → Oct 26)

| Day | Date | Version | Focus Area | Deliverables & Canonical Docs |
|---|---|---|---|---|
| **1** | Sun Oct 4 | `v0.0.1` | **Toolchain & Scaffold** | Install Go 1.27, Bun 1.4, Node 24; create `dev` branch; scaffold `interface/`, `engine/`, `roles/`, `state/`, `docs/`; test `.vecta/` storage. |
| **2** | Mon Oct 5 | `v0.0.2` | **Core Stdio Bridge** | Ink `app.tsx` hello world + Go `main.go` + JSON stdio bridge round-trip test. |
| **3** | Tue Oct 6 | `v0.0.3` | **Terminal Layout Shell** | StatusBar + basic layout shell + Manager I/O loop (type, send, receive). |
| **4** | Wed Oct 7 | `v0.0.4` | **Queue Dispatcher** | TS FIFO queue + Go sequential execution runner (enforcing one-at-a-time execution). |
| **5** | Thu Oct 8 | `v0.0.5` | **First Roles** | `roles/base.ts` shared interface + Manager & Coder implementations with defaultPrompts. |
| **6** | Fri Oct 9 | `v0.0.6` | **Handshake Protocol** | `task-relay.tmp` file handshake + Documenter passive copy (basic write). |
| **7** | Sat Oct 10 | `v0.0.7` | **End-to-End Pipeline** | Full E2E integration test: Manager $\rightarrow$ Coder $\rightarrow$ Documenter. |
| **8** | Sun Oct 11 | `v0.0.8` | **Hardware Scanner** | Go scanner: RAM, disk, GPU/VRAM detection + runtime probes (11434, 1234, 8080). |
| **9** | Mon Oct 12 | `v0.0.9` | **Model Catalog** | Query runtimes for exact model names, scan `.gguf` files on disk, build recommendation engine. |
| **10** | Tue Oct 13 | `v0.0.10` | **Model Wiring** | Wire model catalog into `/agent roles`, implement `llama.cpp` spawn/stop logic. |
| **11** | Wed Oct 14 | `v0.0.11` | **Roles Configuration UI** | `/agent roles` interactive roster `[on]`/`[off]` + model drill-down screens. |
| **12** | Thu Oct 15 | `v0.0.12` | **Prompt & Styling** | `/prompt` editor (≤300 words) + theme color picker. |
| **13** | Fri Oct 16 | `v0.0.13` | **Chats, Projects & Queue** | `/chats` + `/projects` + `/queue` modal overlay (`q` key). |
| **14** | Sat Oct 17 | `v0.0.14` | **Settings & Mode Switching** | `/memory` + `/settings` bare versions + instant `Tab` mode switching. |
| **15** | Sun Oct 18 | `v0.0.15` | **Documenter & Raw Log** | Documenter full handshake + encrypted `raw.log` + `manager-duties.json` state. |
| **16** | Mon Oct 19 | `v0.0.16` | **OS Vault Encryption** | `crypto.go`: key gen, Windows DPAPI integration, AES-GCM encrypt-on-write / decrypt flow. |
| **17** | Tue Oct 20 | `v0.0.17` | **Log Compaction & Pruning** | Ring-buffer eviction, 2-week auto-delete, compaction $\rightarrow$ 350-word `summary.json`. |
| **18** | Wed Oct 21 | `v0.0.18` | **Resilience & Memory Tiers** | Memory tiers wired (`general.json`, `summary.json`, `CCM.json`) + token sidebar + hash loop detector (3x). |
| **19** | Thu Oct 22 | `v0.0.19` | **Device Server** | Go device server (`127.0.0.1`) + `adb reverse` tunnel setup + `vecta device` command. |
| **20** | Fri Oct 23 | `v0.0.20` | **Android Client** | Android emulator client: remote chat view and live task status checklist. |
| **21** | Sat Oct 24 | `v0.0.21` | **Remote Control Sync** | Role toggle & `/prompt` sync back to host machine + session persistence. |
| **22** | Sun Oct 25 | `v0.0.22` | **Failsafe & Demo Polish** | Emulator disconnect auto-pause & reconnect grace window; full demo rehearsal. |
| **23** | Mon Oct 26 | `v0.1.0` | **DEADLINE RELEASE** | Package v0.1.0 + Vecta Device for GitHub and Congressional App Challenge submission. |

---

## 3. Contingency Protocols (No-Debate Fallbacks)

- **Plan A (Mid-Sprint Slips):**
  - Trigger: Any day in Steps 1–4 runs over.
  - Action: Steal paired slack; drop `/prompt` color picker; ship bare `/settings`. Keep queue, roles, and handshake intact.
- **Plan B (Crypto Complexity):**
  - Trigger: Multi-OS vault integration takes >1 extra day.
  - Action: Ship Windows DPAPI encryption only; defer macOS Keychain and Linux Secret Service to v0.2.0.
- **Plan C (Device Difficulties):**
  - Trigger: Device write-back sync hits roadblocks before Oct 25.
  - Action: Cut device to read-only chat + sidebar (no remote write-back).
- **Plan D (Emergency Crunch):**
  - Trigger: 3+ days lost to unforeseen blockers.
  - Action: Ship core CLI (Manager, Coder, Documenter, encrypted raw log, local/cloud model). Defer device and memory UI to post-challenge update.

---

## 4. Cut Order (Strict Hierarchy)

1. Custom role wizard (keep JSON registry only)
2. Token sidebar (bare text counter only)
3. Specialized roles (Security Checker / Frontend / Backend — fallback to generic Coder)
4. Smart UI polish (Shift+Tab auto-accept, complex animations)
5. Hardware scanner (fold into simple port probe)

---

## 5. Post-MVP Backlog (v0.2.0+)

The following confirmed features are explicitly deferred past the October 26 deadline:
- **Physical USB Vecta Device** (Wired USB network interface binding on physical hardware)
- **iOS Vecta Device**
- **Git Awareness Engine** (Commit flows, destructive command confirmation prompts per Doc 20)
- **Named Profile Switcher** (Multiple `.vecta/` datasets switchable from CLI)
- **App-Lock Password & Cloudflare Worker Email Recovery** (Doc 16)
- **Fine-Tuned Purpose-Built Vecta Model** (Doc 22)
- **macOS & Linux Native Vault Support** (if deferred under Plan B)
- **`/pipeline` Preset Pipeline Command**
