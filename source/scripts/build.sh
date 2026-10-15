#!/bin/bash
set -e
# Status:: in-progress
# macOS/Linux build script — compiles Go engine with standard naming + bundles TypeScript interface.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building Go systems engine (vecta-engine)..."
cd "$REPO_DIR/engine"
go build -o vecta-engine .

echo "==> Bundling TypeScript interface..."
cd "$REPO_DIR/interface"
npm run build

echo "==> Vecta built successfully!"

