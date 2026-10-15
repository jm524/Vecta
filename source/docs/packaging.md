# Vecta Installation, Packaging & Distribution Plan

> Planning and specification document for developer toolchains, per-OS installation commands, build pipelines, and end-user distribution packaging.

---

## 1. Overview & Footprint Targets

Vecta is designed around a lean dual-binary architecture with a strict total package size budget:
- **Total Footprint Target:** `< 80 MB total` across UI and systems binaries.
- **Components:**
  1. **Terminal Frontend (`vecta` / `vecta.exe`):** React 18 + Ink 5 terminal UI bundled into an executable via `bun compile` / `esbuild` wrapper.
  2. **Systems Engine (`vecta-engine` / `vecta-engine.exe`):** Statically compiled Go 1.27 backend (`CGO_ENABLED=0`) managing hardware scanning, model runtime discovery, and sequential queue execution.
- **End-User Objective:** Zero prerequisite setup — end users should not be required to manually install Node.js, npm, or Go.

---

## 2. Developer Toolchain Prerequisites

For contributors and build machines building from source:

| Dependency | Minimum Version | Purpose |
|---|---|---|
| **Node.js** | `v24.x` (or Bun `1.4+`) | Interface runtime, TypeScript toolchain, and Ink terminal rendering |
| **npm** | `v10.x` | Dependency management for `interface/package.json` |
| **Go** | `1.27+` | Systems engine compilation for `engine/` |
| **esbuild** | `0.25+` | Fast frontend bundling into `dist/main.js` |

### Installation Commands by Operating System

#### Windows
Using `winget` (Windows Package Manager) in PowerShell (Admin recommended):
```powershell
# Install Node.js LTS and Go
winget install OpenJS.NodeJS.LTS
winget install GoLang.Go

# Verify installations in a new terminal session
node --version
npm --version
go version
```

#### macOS
Using Homebrew:
```bash
# Install Node.js and Go
brew update
brew install node
brew install go

# Verify installations
node -v
npm -v
go version
```

#### Linux (Debian / Ubuntu)
```bash
# Update and install build essentials, Go, and Node.js
sudo apt update
sudo apt install -y curl build-essential

# Node.js (via NodeSource LTS or package manager)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Go
sudo apt install -y golang-go

# Verify installations
node -v
npm -v
go version
```

---

## 3. Dependency Installation (Repository Setup)

Run from the root of the cloned repository:

```bash
# 1. Interface (Node.js / TypeScript dependencies)
cd source/interface
npm install

# 2. Engine (Go module dependencies)
cd ../engine
go mod download
```

---

## 4. Build & Compilation Pipelines

### Automated Scripts

Pre-configured build scripts are available in [`source/scripts/`](file:///C:/Github/Vecta/source/scripts/):

- **Windows (PowerShell):**
  ```powershell
  .\source\scripts\build.ps1
  ```
- **macOS / Linux (Bash):**
  ```bash
  chmod +x source/scripts/build.sh
  ./source/scripts/build.sh
  ```

### Manual Build Steps

#### 1. Compile Go Systems Engine
Produce a standalone static binary with stripped debug symbols:
```bash
cd source/engine

# Windows
go build -ldflags="-s -w" -o vecta-engine.exe .

# macOS / Linux
go build -ldflags="-s -w" -o vecta-engine .
```

#### 2. Bundle Interface
Bundle the TypeScript terminal interface:
```bash
cd source/interface
npm run build
# Outputs self-contained ESM bundle to source/interface/dist/main.js
```

---

## 5. Per-OS Execution Commands

### Development Mode (Hot Execution)
```bash
cd source/interface
npm run dev
```

### Running Built Artifacts

#### Windows (PowerShell / Command Prompt / Windows Terminal)
```powershell
# Running bundled distribution
node source\interface\dist\main.js

# Or running compiled wrapper
.\vecta.exe
```

#### macOS (Terminal / iTerm2)
```bash
# Running bundled distribution
node source/interface/dist/main.js

# Or running compiled wrapper
./vecta
```

#### Linux (Console / Bash / Zsh)
```bash
# Running bundled distribution
node source/interface/dist/main.js

# Or running compiled wrapper
./vecta
```

---

## 6. End-User Packaging & Single-Binary Strategy

### Distribution Artifacts (Target Release)

Each release archive contains exactly two co-located binaries:
```text
vecta-dist/
├── vecta (or vecta.exe)          # Compiled terminal UI executable
└── vecta-engine (or vecta-engine.exe) # Static Go systems engine
```

### Single Binary Creation for Interface
To eliminate the requirement for a global Node.js runtime on the user's system:
1. **Option A (Bun Compile):** Compile `main.ts` directly via `bun build --compile --outfile vecta src/main.ts`.
2. **Option B (Node SEA - Single Executable Applications):** Use Node's built-in SEA preparation blob injected into the Node binary.

### Binary Discovery Guarantee
The frontend bridge client ([`client.ts`](file:///C:/Github/Vecta/source/interface/src/bridge/client.ts)) dynamically locates the backend engine via:
1. Candidate search directories: adjacent folder, `../../engine`, `../engine`, `./bin`.
2. Binary name fallback: checks for `vecta-engine` (or `vecta-engine.exe`) first, falling back to `engine` if built without an explicit target name.

---

## 7. System PATH Installation & Linking

### Windows
- Target installation directory: `%LOCALAPPDATA%\Programs\Vecta`
- Add `%LOCALAPPDATA%\Programs\Vecta` to User `PATH`.
- Script: `install.ps1` (copies `vecta.exe` and `vecta-engine.exe` to target directory).

### macOS & Linux
- Target directory: `/usr/local/bin` (system-wide) or `~/.local/bin` (user-level).
- Create symlinks or copy binaries:
  ```bash
  install -m 755 vecta /usr/local/bin/vecta
  install -m 755 vecta-engine /usr/local/bin/vecta-engine
  ```
- Script: [`source/scripts/install.sh`](file:///C:/Github/Vecta/source/scripts/install.sh).

---

## 8. Platform Edge Cases & Considerations

- **macOS Gatekeeper:** Binaries downloaded from GitHub releases will receive the `com.apple.quarantine` extended attribute. Packaging must document running `xattr -d com.apple.quarantine vecta*` or include code-signing/notarization.
- **Apple Silicon vs. Intel:** macOS releases should provide separate `darwin-arm64` and `darwin-amd64` archives, or a lipo-merged universal binary for the Go engine.
- **Linux Terminal Color Support:** Ensure `COLORTERM=truecolor` and terminal UTF-8 encoding support for Ink flexbox borders and status indicators.
- **Windows Terminal Rendering:** Recommend Windows Terminal over legacy `conhost.exe` for ANSI escape sequence support and 256-color fidelity.