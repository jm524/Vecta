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
