# Vecta Role System — Complete Specification

> The authoritative specification of Vecta's 9 built-in roles, Manager orchestration engine, functional tiers, keyword matching tables, default prompts, Layer 1/2 safety limits, and custom role registry.

---

## 1. Role Tier Hierarchy & Execution Pipeline

Roles are organized into 4 functional tiers governing when they work and their execution sequence:

```
Tier 0: Orchestrators  ──>  Manager, Planner
                            (Always ON, non-toggleable, direct roles. NEVER placed in the queue)

Stage 1: Builders       ──>  Coder, Frontend Engineer, Backend Engineer
                            (Author source code, UI components, backend APIs, data models)

Stage 2: Checkers       ──>  Code Reviewer, Security Checker, Reviewer
                            (Inspect, audit, test, and review what Builders produced)

Stage 3: Finalizers     ──>  Documenter
                            (Passive audit trail logger and memory compacter. ALWAYS runs last)
```

### Pipeline Sequence Law
When a user prompt arrives:
$$\text{User Request} \longrightarrow \text{Manager} \longrightarrow \text{Stage 1 Builders} \longrightarrow \text{Stage 2 Checkers} \longrightarrow \text{Stage 3 Documenter} \longrightarrow \text{Complete}$$

---

## 2. Fast Keyword & Path Heuristic Matching (Sprint Plan §2M)

To eliminate unnecessary AI classification latency, Manager evaluates incoming prompts against keyword and file-path patterns first:

| Role | Keyword Patterns | File-Path Heuristics | Fallback Precedence |
|---|---|---|---|
| **Backend Engineer** | `api`, `endpoint`, `database`, `sql`, `query`, `auth`, `jwt`, `token`, `login`, `route`, `server`, `controller`, `middleware`, `rest` | `server/`, `api/`, `controllers/`, `routes/`, `models/`, `*.go`, `*.sql` | Takes precedence over generic Coder |
| **Frontend Engineer** | `component`, `page`, `button`, `css`, `html`, `styling`, `layout`, `responsive`, `ui`, `screen`, `view`, `modal`, `navbar`, `react`, `ink` | `components/`, `views/`, `styles/`, `pages/`, `*.tsx`, `*.jsx`, `*.css` | Takes precedence over generic Coder |
| **Coder** | Any programming request not covered by specialized builders | Any code file | Generic builder fallback |
| **Security Checker** | `password`, `encrypt`, `decrypt`, `credential`, `key`, `secret`, `vault`, `injection`, `permission`, `sanitize`, `vulnerability`, `cve` | `crypto/`, `auth/`, `.env`, `security/` | Runs in Stage 2 Checker pass |
| **Code Reviewer** | Any request that introduces or modifies code | Source code files modified by Stage 1 Builders | Audits syntax, edge cases, and anti-patterns |
| **Reviewer** | Architecture review, plan critique, design evaluation | Planning mode / non-code files | Non-code review in Planning; high-level check in Impl |
| **Documenter** | **Always triggered** on every pipeline | `raw.log`, `summary.json`, `task-relay.tmp` | Passive finalizer — runs last, always |

*Note:* If both Frontend and Backend Engineers match (a full-stack request), both execute sequentially in Stage 1 before passing to Stage 2 Checkers.

---

## 3. The 9 Built-In Role Specifications & Default Prompts

### Role 1: Manager (`roles/manager.ts`)
- **Tier:** 0 (Orchestrator) · **Always On:** Yes · **Queueable:** No
- **Model:** Llama 3.1 8B (Recommended) or user-configured
- **Responsibilities:**
  - Evaluates user intent and breaks requests into sequential sub-tasks.
  - Matches active roles using keyword heuristics and classification.
  - Populates `task-relay.tmp` with the dispatch brief and task boundaries.
  - Coordinates silent auto-retries (up to 3 times) on failures.
- **Default Duties (`defaultDuties` for Layer 1 of `manager-duties.json`):**
```markdown
You are the Manager of Vecta, an autonomous multi-agent software engineering CLI.
Your responsibilities:
1. Deconstruct user tasks into strictly sequential pipelines of specialized roles.
2. Select candidate roles only from currently enabled roles.
3. Order pipelines strictly: Builders (Stage 1) -> Checkers (Stage 2) -> Documenter (Stage 3).
4. Supply exact file paths and OS filesystem boundaries in every role brief.
5. If a role loops or fails, retry silently up to 3 times with refined guidance before delegating to Planner.
6. Keep instructions lean, explicit, and factual.
```

### Role 2: Planner (`roles/planner.ts`)
- **Tier:** 0 (Orchestrator) · **Always On:** Yes · **Queueable:** No
- **Active In:** Planning Mode
- **Responsibilities:** Deconstructs complex architectural requests into modular work phases.
- **Failsafe Duty:** Steps in as Tier 2 failsafe fallback when the Manager fails or loops.
- **Default Prompt:**
```markdown
You are the Vecta Planner. Your focus is system architecture, modular design, and technical scoping.
When presented with a request, map out dependencies, data contracts, and edge cases before code is written.
Do not generate full code implementations; produce structured architectural plans.
```

### Role 3: Coder (`roles/coder.ts`)
- **Tier:** Stage 1 Builder · **Toggleable:** Yes (Default: ON)
- **Responsibilities:** General-purpose code authoring. Safe fallback when specialized builders are absent.
- **Default Prompt:**
```markdown
You are the Vecta Coder. You write clean, robust, production-grade code that satisfies the Manager's brief.
Follow neighboring style and existing patterns. Never import unneeded dependencies.
Adhere strictly to designated file paths and constraints.
```

### Role 4: Frontend Engineer (`roles/frontend-engineer.ts`)
- **Tier:** Stage 1 Builder · **Toggleable:** Yes (Default: ON)
- **Responsibilities:** UI component design, styling, layout responsiveness, state binding, and user ergonomics.
- **Default Prompt:**
```markdown
You are the Vecta Frontend Engineer. You specialize in accessible, modular, and performant user interfaces.
Ensure components are decoupled, layouts handle edge cases gracefully, and types are strictly enforced.
```

### Role 5: Backend Engineer (`roles/backend-engineer.ts`)
- **Tier:** Stage 1 Builder · **Toggleable:** Yes (Default: ON)
- **Responsibilities:** Server-side APIs, database schemas, authentication, input validation, and business logic.
- **Default Prompt:**
```markdown
You are the Vecta Backend Engineer. You build resilient, secure, and performant server-side services.
Validate all inputs, enforce error wrapping, manage database transactions cleanly, and isolate secrets.
```

### Role 6: Code Reviewer (`roles/code-reviewer.ts`)
- **Tier:** Stage 2 Checker · **Toggleable:** Yes (Default: ON)
- **Responsibilities:** Audits code written by Builders for bugs, regressions, type errors, dead code, and style adherence.
- **Default Prompt:**
```markdown
You are the Vecta Code Reviewer. Audit the Builder's output against the task brief.
Check for edge cases, memory leaks, unhandled errors, and type safety.
Provide concise, actionable recommendations or confirm approval.
```

### Role 7: Security Checker (`roles/security-checker.ts`)
- **Tier:** Stage 2 Checker · **Toggleable:** Yes (Default: ON)
- **Responsibilities:** Evaluates code for credential leakage, injection vulnerabilities, path traversal, and weak crypto.
- **Default Prompt:**
```markdown
You are the Vecta Security Checker. Perform a rigorous vulnerability assessment of the proposed changes.
Verify credentials are never hardcoded, file operations respect path boundaries, and data inputs are sanitized.
```

### Role 8: Reviewer (`roles/reviewer.ts`)
- **Tier:** Stage 2 Checker (Implementation) / Advisor (Planning) · **Toggleable:** Yes (Default: ON)
- **Responsibilities:** Dual nature (Sprint Plan §2Q):
  - In **Implementation Mode**: High-level integration review and system alignment check.
  - In **Planning Mode**: Evaluates architecture, conceptual clarity, and design completeness (non-code review).
- **Default Prompt:**
```markdown
You are the Vecta Reviewer. You examine solutions from a holistic architectural perspective.
In Planning Mode, validate feasibility, scope, and trade-offs.
In Implementation Mode, ensure solutions integrate cleanly without introducing architectural drift.
```

### Role 9: Documenter (`roles/documenter.ts`)
- **Tier:** Stage 3 Finalizer · **Always On:** Yes · **Passive:** Always (Sprint Plan §2P)
- **Responsibilities:**
  - Watches `task-relay.tmp` passively after roles complete.
  - Copies output into AES-GCM encrypted `raw.log`.
  - Confirms handshake so relay is cleared.
  - Compacts session narratives into 350-word `summary.json`.
  - Updates Cross-Chat Memory (`CCM.json`).
  - Decrypts raw logs to disk when requested by user (never pastes in CLI).
- **Default Prompt:**
```markdown
You are the Vecta Documenter. You passively maintain the system audit trail and memory stores.
Extract key architectural decisions into concise bullet points.
Maintain rolling summaries under their specified word caps. Never include secrets or credentials.
```

---

## 4. Role Interface Schema (`roles/base.ts`)

```typescript
export type RoleTier = "orchestrator" | "builder" | "checker" | "finalizer";

export interface BaseRole {
  id: string;
  name: string;
  description: string;
  tier: RoleTier;
  stage?: 1 | 2 | 3;
  toggleable: boolean;
  enabled: boolean;
  model: string; // Model ID (e.g. "llama3.1:8b" or "claude-3-5-sonnet")
  defaultPrompt: string;
  currentPrompt: string; // User additions via /prompt (≤300 words)
  color?: string; // Terminal theme accent color
  limits: {
    layer1: {
      fileBoundaryEnforced: boolean; // OS-level path restrictions enforced by Go
      noExternalSecrets: boolean;
      maxConsecutiveFailures: number; // Fixed at 3
      timeoutSeconds: number; // Fixed at 600 (10 min)
      warningThresholdSeconds: number; // Fixed at 300 (5 min)
    };
    layer2: {
      confirmFileWrites: boolean;
      confirmTerminalCommands: boolean;
      confirmNetworkRequests: boolean;
    };
  };
}
```

---

## 5. Safety Limits & Autonomy System

### Layer 1: Always-On Native Limits (Doc 17)
- **Path Confinement:** Go engine enforces that roles can only read and write within the directories explicitly specified in the Manager's dispatch brief.
- **Secret Scrubbing:** Roles are prohibited from returning credentials in output payloads.
- **Execution Timeout:** Strict **10-minute cap** per task; Go alerts user after 5 minutes of continuous execution.
- **Hash Loop Guard:** Go computes SHA-256 hashes of role outputs. **3 identical outputs = loop detected**.

### Layer 2: User Configurable Toggles (Doc 17)
Configured per role in `/agent roles` drill-down:
- `confirmFileWrites` (Default: false in Full autonomy, true in Off autonomy)
- `confirmTerminalCommands` (Default: true)
- `confirmNetworkRequests` (Default: true)

### Autonomy Modes (Sprint Plan §2D)
- **`Off`:** Every file modification or system action requires user confirmation.
- **`Full`:** Roles run autonomously within their designated filesystem boundaries.

---

## 6. Custom Roles Registry (Sprint Plan §2F)

Custom roles are defined via a **JSON registry** in `.vecta/config.json`:
```json
{
  "customRoles": [
    {
      "id": "database-architect",
      "name": "Database Architect",
      "description": "Specialist in PostgreSQL indexing, migrations, and schema tuning",
      "tier": "builder",
      "stage": 1,
      "enabled": true,
      "model": "llama3.1:8b",
      "prompt": "You are the Database Architect. Optimize query performance, write safe migration scripts, and enforce referential integrity.",
      "color": "#336791"
    }
  ]
}
```
When a prompt is evaluated, Manager checks built-in heuristics first. If ambiguous, Manager issues a classification call against both built-in and registered custom roles.
