# Vecta Agent Prompt Library & Standards

> Prompt templates, engineering guidelines, and coding standards for AI agents contributing to the Vecta codebase.
> Stays on `dev` branch — never merged to `main`.

---

## 1. System Engineering Standards

### TypeScript & Ink Guidelines
- **Strict Typing:** Every variable, parameter, and return value must be explicitly typed. No `any`, no implicit inference.
- **Flexbox Exclusivity:** Ink components rely on Yoga layout. Always explicitly specify `flexDirection: "column"` or `"row"`.
- **Discriminated Unions for State:**
  ```typescript
  type RoleStatus = "idle" | "working" | "stuck" | "done";
  ```
- **Single Component per File:** UI components receive state via hooks (`useQueue`, `useRoles`); they do not own raw relay files directly.
- **Centralized Keyboard Handling:** All shortcut inputs (`Tab`, `q`, `Ctrl+→`, `Ctrl+←`, `Esc`) must be routed through centralized hooks to avoid race conditions.

### Go Systems Guidelines
- **Error Wrapping:** Always wrap errors with contextual detail:
  ```go
  return fmt.Errorf("dispatching task %s to queue: %w", taskID, err)
  ```
- **Sequential Execution Law:** No concurrent queue dispatch. Any goroutines used for health checks or background hardware probes must be tightly scoped and explicitly documented.
- **Context Propagation:** All subprocess calls, network sockets, and file operations must accept and respect `context.Context`.
- **Memory Zeroing:** Sensitive cryptographic slices (keys, plaintexts) must be zeroed explicitly after use:
  ```go
  defer func() {
      for i := range key {
          key[i] = 0
      }
  }()
  ```
- **Cleanup Handlers:** Always defer closing file descriptors, pipes, and mutex locks immediately after acquisition.

---

## 2. Prompt Library for Subagent Delegation

### Task Prompt: Authoring a New Role
```
You are implementing role [ROLE_NAME] for Vecta in `roles/[ROLE_NAME].ts`.
Follow `roles/base.ts` interface strictly.
- Role Tier: [Orchestrator | Builder | Checker | Finalizer]
- Default Prompt: Author a concise, highly focused system prompt (≤300 words).
- Layer 1 limits: Enforce file boundaries and 3-retry max.
- Layer 2 limits: Provide defaults for write confirmation.
Ensure 100% type safety and zero unused imports.
```

### Task Prompt: Implementing Go Engine Subsystem
```
You are implementing the [SUBSYSTEM_NAME] in Go under `engine/[SUBSYSTEM_NAME]/`.
- Must compile cleanly with Go 1.27.
- Implement strictly sequential logic; do not introduce goroutine concurrency unless explicitly asked for liveness probes.
- Wrap all errors using `fmt.Errorf("...: %w", err)`.
- Use `context.Context` on all long-running or cancellable functions.
- Add zeroing for sensitive byte buffers.
```
