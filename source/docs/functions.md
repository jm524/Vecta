# Vecta Execution Flows & Function Specifications

> The complete architectural flow manual detailing every step-by-step system execution sequence in Vecta.
> Synthesized from Docs 07, 08, 09, 10, 11, 12, 13, 18, 19, 22, 23, and 26.

---

## Flow 1: Startup, Hardware Scan & Bridge Handshake

```mermaid
sequenceDiagram
    autonumber
    participant TS as TypeScript Interface (main.ts)
    participant Go as Go Systems Engine (main.go)
    participant OS as Operating System / Hardware
    participant Ink as Ink Terminal UI (app.tsx)

    TS->>TS: Initialize paths (helpers/paths.ts)
    TS->>TS: Check .vecta/ (initVectaStorage if missing)
    TS->>Go: Spawn engine binary (vecta-engine) with stdio pipes
    TS->>Go: Send {"action": "ping"} over stdin
    Go-->>TS: Respond {"success": true, "data": {"status": "ready"}}
    TS->>Go: Send {"action": "scan_hardware"}
    Go->>OS: Query RAM, VRAM, GPU, disk capacity
    Go-->>TS: Return HardwareReport
    TS->>Go: Send {"action": "scan_models"}
    Go->>OS: Probe ports (11434, 1234, 8080) & scan folders for .gguf
    Go-->>TS: Return ModelCatalog
    TS->>Ink: Mount App component & render StatusBar + Chat
```

---

## Flow 2: Cold Prompt to Dynamic Pipeline Assembly

1. **User Input:** User submits prompt in Implementation Mode.
2. **Keyword & Path Evaluation (Sprint Plan §2M):**
   - Manager checks enabled roles against keyword patterns:
     - `auth`, `login`, `database` $\rightarrow$ **Backend Engineer**
     - `component`, `button`, `css` $\rightarrow$ **Frontend Engineer**
     - `password`, `key`, `crypto` $\rightarrow$ **Security Checker**
3. **Ambiguity Resolution:** If unassigned or custom roles match, Manager runs a single internal classification query.
4. **Pipeline Sorting:** Selected roles are ordered strictly by functional tier:
   $$\text{Stage 1 (Builders)} \longrightarrow \text{Stage 2 (Checkers)} \longrightarrow \text{Stage 3 (Documenter)}$$
5. **Sidebar Sync:** Pipeline is pushed to the Queue state and displayed on the Sidebar checklist.

---

## Flow 3: Sequential Queue Execution & Path Boundaries

```mermaid
flowchart TD
    Queue[Queue State in TS] -->|Task 1: Next Role| Dispatch[TypeScript Dispatcher]
    Dispatch -->|Extended Brief| Relay[task-relay.tmp]
    Dispatch -->|Command| GoRunner[Go Queue Runner]
    
    subgraph Go Engine Isolation
        GoRunner --> PathCheck{Validate Target Paths}
        PathCheck -->|Within Bounds| ExecRole[Execute Role Subprocess / API]
        PathCheck -->|Outside Bounds| FailBoundary[Abort & Return Permission Error]
    end
    
    ExecRole -->|Write Output| Relay
    Relay --> Handshake[Documenter Handshake Flow]
```

- **Sequential Law:** Queue runner dispatches one task at a time. Concurrency is strictly prohibited.
- **Filesystem Boundaries:** Go verifies that all file read/write operations by the active role remain within the directories designated in the Manager's brief.

---

## Flow 4: Role Handoff & `task-relay.tmp` Handshake (Sprint Plan §2N, §2G)

### The Extended Dispatch Brief
During dispatch, `task-relay.tmp` is temporarily extended with the full context:
```json
{
  "taskId": "task-001",
  "role": "backend-engineer",
  "userPrompt": "Add JWT authentication to /api/login",
  "managerPlan": "Implement HMAC-SHA256 signing and bearer token verification",
  "rolePrompt": {
    "defaultPrompt": "You are the Vecta Backend Engineer...",
    "customInstructions": "Use standard crypto library only"
  },
  "fileBoundaries": ["source/engine/auth/"],
  "targetFiles": ["source/engine/auth/jwt.go"],
  "memorySnippets": ["User prefers standard library over external JWT packages"],
  "previousOutput": null
}
```

### The 4-Step Handshake Protocol
```mermaid
sequenceDiagram
    autonumber
    participant Role as Active Role (e.g. Coder)
    participant Relay as task-relay.tmp
    participant Doc as Documenter Role
    participant Log as raw.log (AES-GCM)
    participant Mgr as Manager State

    Role->>Relay: Write completed output & artifacts
    Doc->>Relay: Passively read role output
    Doc->>Log: Encrypt & append output to raw.log
    Doc->>Mgr: Confirm copy success (acknowledgment token)
    Mgr->>Relay: Flush output & stage next role brief
```
*Note:* After the role consumes the brief, `task-relay.tmp` reverts to its standard compact structure.

---

## Flow 5: Memory Lifecycle & Compaction (Sprint Plan §2E)

Vecta maintains exactly three memory files across the system:

```
┌────────────────────────────────────────────────────────┐
│ general.json                                           │
│ Global user preferences across all chats and projects. │
│ Never auto-compacted. Read on every session start.    │
└────────────────────────────────────────────────────────┘
                           ▲
                           │ Updates on persistent decisions
┌──────────────────────────┴─────────────────────────────┐
│ summary.json (Per Chat)                                │
│ Rolling narrative capped at 350 words.                 │
│ Bulleted Key Points capturing architectural decisions. │
└────────────────────────────────────────────────────────┘
                           ▲
                           │ Scoped persistence
┌──────────────────────────┴─────────────────────────────┐
│ CCM.json (Cross-Chat Memory per Scope)                 │
│ One per scope: General Standalone + Each Named Project.│
│ Rolling narrative capped at 700 words.                 │
└────────────────────────────────────────────────────────┘
```

1. **Per-Turn Roll:** Documenter folds new events from `task-relay.tmp` into `summary.json`.
2. **Word Cap Enforcement:** If `summary.json` narrative exceeds 350 words, Documenter condenses the oldest narrative sections into concise summaries.
3. **Cross-Chat Propagation:** Reusable project patterns are promoted to `CCM.json` under the active project scope.

---

## Flow 6: Token Usage Tracking & Sidebar Reset (Sprint Plan §2K)

- **Cloud Roles:** Token usage is parsed directly from API response headers/payloads.
- **Local Roles:** Estimated via local tokenizer approximation.
- **Per-Task Reset (Sprint Plan §2K):** The sidebar task token counter **resets to 0 at the start of each task**.
- **Caps:**
  - **Cap 1 (Warning):** 10,000 tokens per task.
  - **Cap 2 (Hard Limit):** 100,000 tokens per task.

---

## Flow 7: Hash Loop Detection & 4-Tier Failsafe Chain (Sprint Plan §2J, §4)

```mermaid
flowchart TD
    RoleOut[Role Produces Output] --> Hash[Go Computes SHA-256 Hash]
    Hash --> CheckLoop{3 Identical Hashes in a Row?}
    
    CheckLoop -->|No| Success[Task Complete -> Documenter]
    CheckLoop -->|Yes - Loop Detected| Failsafe[Initiate 4-Tier Failsafe Chain]
    
    subgraph Failsafe Chain
        Failsafe --> T1[Tier 1: Manager Auto-Retries Silently up to 3x]
        T1 -->|Still Failing| T2[Tier 2: Planner Halts Pipeline & Takes Over as Manager]
        T2 -->|Still Failing| T3[Tier 3: Go Engine Selects Alternative Role / Dual Assignment]
        T3 -->|Still Failing| T4[Tier 4: Go Prints Plain Terminal Message to User]
    end
    
    T4 --> UserChoice[User Selects: Retry / Skip / Abort]
```

---

## Flow 8: Model Lifecycle Management (Sprint Plan §2U)

1. **Local GGUF Dispatch:** When a role assigned to a local `.gguf` model is called:
   - Go engine checks if `llama.cpp` is running on `127.0.0.1:8080`.
   - If not running, Go spawns `llama.cpp` pointing to the designated `.gguf` file.
2. **Execution:** The role sends inference queries to `127.0.0.1:8080`.
3. **Teardown:** When the role finishes:
   - If the role is the **Manager**, the model stays loaded (best-effort hot keep).
   - For all other roles, Go immediately terminates the `llama.cpp` process to free RAM and VRAM for the next role.

---

## Flow 9: Vecta Device Server & Emulator Bridge (Sprint Plan §3)

1. **Host Server:** Go engine spawns an HTTP/WebSocket server bound strictly to `127.0.0.1:8765` (never `0.0.0.0`, never wifi).
2. **ADB Reverse Tunnel:** TypeScript triggers `adb reverse tcp:8765 tcp:8765` to tunnel the port to the Android emulator.
3. **Android Client Sync:**
   - Client connects over localhost socket.
   - Displays real-time chat messages and live task checklist.
   - Allows toggling roles `[on]`/`[off]` and syncing `/prompt` additions back to the desktop CLI.
4. **Disconnection Handling:** If the emulator disconnects or the reverse socket drops, the queue automatically pauses and enters a reconnect grace window.

---

## Flow 10: Blank Chat Lifecycle & On-Message Official Creation

1. **CLI Startup:**
   - App mounts `useSession` with `activeChatId = null` and empty message buffer `messages = []`.
   - No chat records are loaded from disk and zero files are written to `.vecta/chats/`.
   - The user sees a clean standalone blank chat interface (`Vecta ready. Type a prompt below...`).
2. **First User Message Submission:**
   - User types a prompt and submits.
   - `addMessage("User", promptText)` detects `activeChatId === null`.
   - Triggers `chatService.createChat(title, null)`, deriving the title from the first prompt snippet.
   - Sets `activeChatId` and `activeChat` synchronously.
   - Writes `meta.json`, `messages.json`, and `manager-duties.json` to `.vecta/chats/[chat-id]/` and indexes the chat in `.vecta/chats/index.json`.
3. **Pipeline & Role Execution:**
   - The sequential task pipeline executes within the newly created chat ID.
   - Role outputs and Documenter logs persist to the new chat.
4. **Blank Chat Reset:**
   - Running `/new` (or `/chat new`) resets the session back to a blank standalone state at any time.

---

## Flow 11: OS Native Vault & Write-Time Encryption Flow (Claude Docs 14, 15, 26)

```mermaid
sequenceDiagram
    autonumber
    participant Doc as Documenter (documenter.ts)
    participant Bridge as Bridge Client (client.ts)
    participant Engine as Go Crypto Engine (crypto.go)
    participant Vault as OS Native Vault (Credential Manager / DPAPI)
    participant Disk as Disk Storage (raw.log)

    Doc->>Doc: Format logfmt meeting minutes in memory
    Doc->>Bridge: Send cryptoEncrypt(plaintext)
    Bridge->>Engine: IPC {"action": "crypto_encrypt", "payload": {"plaintext": "..."}}
    Engine->>Vault: Retrieve "vecta-encryption-key"
    Vault-->>Engine: Return 32-byte master key
    Engine->>Engine: Generate random 12-byte nonce (crypto/rand)
    Engine->>Engine: Encrypt with AES-256-GCM
    Engine->>Engine: Immediately Memzero(key) in RAM
    Engine-->>Bridge: Return {"ciphertext": "ENC:v1:<base64>"}
    Bridge-->>Doc: Return encrypted ciphertext line
    Doc->>Disk: Append "ENC:v1:..." to raw_[scramble].log (Plaintext NEVER touches disk)
```

1. **First-Run Key Initialization:**
   - Vecta checks whether `vecta-encryption-key` exists in the OS native vault.
   - If missing, a 256-bit (32-byte) key is generated purely in RAM using `crypto/rand`.
   - The key is saved to Windows Credential Manager (`advapi32.dll` via `CredWriteW` as `CRED_PERSIST_LOCAL_MACHINE`) with DPAPI fallback (`crypt32.dll` `CryptProtectData`).
   - The in-memory key buffer is immediately overwritten with zeros (`Memzero`).
   - `.vecta/config.json` sets `"encryptionKeySet": true` (never storing the raw key on disk).
2. **Write-Time Encryption (Claude Doc 14 & 15):**
   - Documenter formats meeting-minutes records into single-line logfmt format (`documenterPassiveCopy`).
   - Plaintext is passed to Go's AES-256-GCM encryption engine over the stdio bridge.
   - The master key is retrieved on-demand from the OS vault, data is encrypted with a unique 12-byte random nonce, and the key is zeroed immediately from RAM.
   - Only the scrambled `ENC:v1:<base64>` ciphertext is written to disk.
3. **Read-Time Decryption (Claude Doc 15):**
   - When reading raw logs (`getRawLogEntries`) for compaction, display, or turn generation, `crypto.Decrypt()` unpacks `ENC:v1:...` lines in memory.
   - The decrypted text exists strictly in RAM and is never written to disk in plain form. Legacy unencrypted entries are handled transparently for backward compatibility.
4. **Cloud API Key Protection:**
   - User-assigned cloud API keys (Anthropic, OpenAI, Gemini) are stored directly into the OS vault under `vecta-api-key-[role-slug]`.
   - Roles configuration files (`config.json` and `custom-roles.json`) only retain the boolean marker `"apiKeySet": true`, ensuring credentials are never exposed in plaintext configuration files.

---

## Flow 12: Log Compaction, Ring-Buffer Eviction & Inactivity Pruning Flow (Claude Doc 14, Sprint Plan §2H, §2I)

```mermaid
flowchart TD
    subgraph Trigger["1. Execution Triggers"]
        TC["Task Chunk Finished (useQueue / officialTurn)"]
        PW["Passive Copy Write (documenterPassiveCopy)"]
        CL["CLI Startup (app.tsx checkBridge)"]
    end

    subgraph Compaction["2. Rolling Compaction to summary.json"]
        TC --> DCS["documenterCompactToSummary(chatId)"]
        DCS --> RAW["Read decrypted recent entries from raw.log"]
        RAW --> COND["Condense into accountant-style task summary"]
        COND --> ROLL["Enforce 350-word cap: truncateOldestWords()"]
        ROLL --> SUMM[("summary.json (Plain text, rolling narrative, permanent Key Points)")]
        SUMM --> TOUCH1["chatService.touchChatActivity(chatId)"]
    end

    subgraph RingBuffer["3. Ring-Buffer Size Cap Eviction"]
        PW --> RBE["enforceRawLogRingBuffer(chatId)"]
        TC --> RBE
        RBE --> CAP{"raw.log size > rawLogCapMB (default 256MB)?"}
        CAP -- "No" --> NOP["Do nothing; preserve log"]
        CAP -- "Yes" --> PRUNE["Drop oldest encrypted lines from top of file (prunes 25% to preserve 75% of log)"]
        PRUNE --> WR["Write back remaining lines (newest entries preserved)"]
    end

    subgraph AutoDelete["4. Inactivity Auto-Delete Runner"]
        CL --> PAR["pruneInactiveRawLogs()"]
        PAR --> CHK{"autoDeleteWeeks > 0 (default 2 weeks)?"}
        CHK -- "No (0 = disabled)" --> DIS["Keep raw logs indefinitely"]
        CHK -- "Yes" --> TIME{"lastActiveAt < cutoff?"}
        TIME -- "No (Active)" --> KEEP["Keep raw.log"]
        TIME -- "Yes (Inactive)" --> DEL["Delete raw_[scramble].log ONLY"]
        DEL --> SURV["Preserve summary.json, Key Points, CCM.json, and meta.json"]
    end
```

1. **Task-Chunk Rolling Compaction (Claude Doc 14 & Sprint Plan §2E, §2H):**
   - Documenter condenses raw log entries into `summary.json` at task-chunk completion (not on a timer).
   - Rolling 350-word cap: when narrative additions exceed 350 words, oldest task summaries are pruned from the beginning of `summary.json` (`truncateOldestWords`), preserving the newest tasks at the end.
   - Key Points (Tier 2/3 permanent points) are strictly protected and never compacted or deleted.
   - `summary.json` is stored as plain text JSON for fast display in `/memory` and Manager briefing.
2. **Ring-Buffer Eviction for `raw.log` (Sprint Plan §2H):**
   - Enforces `rawLogCapMB` from `/settings` (default 256MB, configurable up to 1024MB).
   - When raw log exceeds capacity, oldest encrypted lines at the top of the file are dropped to bring the file down to 75% of cap (pruning only 25% of the oldest entries, preserving 75% of the log history).
   - Runs automatically on every write via `documenterPassiveCopy()` and after pipeline completion.
3. **Inactivity Auto-Delete Runner (Claude Doc 14 & Sprint Plan §2I):**
   - Automatically prunes `raw_[scramble].log` for chats exceeding `autoDeleteWeeks` of inactivity (default 2 weeks).
   - When `autoDeleteWeeks` is 0, auto-delete is disabled and raw logs are kept indefinitely.
   - Inactivity timer resets ONLY when a user sends a message / executes a task or Documenter logs/compacts. Opening or switching chats does NOT reset the timer.
   - Safe deletion: Only `raw_[scramble].log` is pruned; `summary.json`, `meta.json`, `messages.json`, and Key Points are permanently preserved.



