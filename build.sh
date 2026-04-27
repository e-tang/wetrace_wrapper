#!/bin/bash
# build.sh — build WetraceTool Electron installer.
#
# Usage:
#   ./build.sh           # build installer (requires wetrace.exe in vendor/)
#   ./build.sh --wetrace # rebuild wetrace.exe from source first, then build installer

set -euo pipefail
cd "$( dirname "${BASH_SOURCE[0]}" )"

# ── Parse flags ───────────────────────────────────────────────────────────────
BUILD_WETRACE=0

for arg in "$@"; do
    case "$arg" in
        --wetrace) BUILD_WETRACE=1 ;;
        *) echo "[ERROR] Unknown flag: $arg. Use --wetrace."; exit 1 ;;
    esac
done

# ── Locate Node ───────────────────────────────────────────────────────────────
NODE_PATH="/cygdrive/c/node-v20.19.0-win-x64"
[[ -f "$NODE_PATH/node.exe" ]] && export PATH="$NODE_PATH:$PATH"
command -v node &>/dev/null || { echo "[ERROR] Node.js not found."; exit 1; }
echo "[OK] Node: $(node --version)"

mkdir -p vendor

# ── wetrace.exe ───────────────────────────────────────────────────────────────
if [[ $BUILD_WETRACE -eq 1 ]]; then
    echo ""
    echo "============================================================"
    echo " Building wetrace.exe (Go)"
    echo "============================================================"
    WETRACE_SRC="/cygdrive/c/cygwin64/home/dev/code/wetrace"
    if ! command -v go &>/dev/null; then
        echo "[WARN] go not found — skipping wetrace build."
    elif [[ ! -f "$WETRACE_SRC/main.go" ]]; then
        echo "[WARN] wetrace source not found at $WETRACE_SRC — skipping."
    else
        pushd "$WETRACE_SRC" > /dev/null
        go build -ldflags "-H windowsgui" -o "$(cygpath -w "$OLDPWD/vendor/wetrace.exe")" .
        popd > /dev/null
        echo "[OK] vendor/wetrace.exe"
    fi
fi

# ── Check wetrace.exe is present ──────────────────────────────────────────────
if [[ ! -f "vendor/wetrace.exe" ]]; then
    echo "[ERROR] vendor/wetrace.exe not found."
    echo "        Run ./build.sh --wetrace to build it, or copy it from the wereadmsg project:"
    echo "        cp ../wereadmsg/vendor/wetrace.exe vendor/"
    exit 1
fi
echo "[OK] vendor/wetrace.exe present"

# ── Electron installer ────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo " Building Electron installer (electron-builder)"
echo "============================================================"
npm install
npm run dist
echo "[OK] Electron installer built."

echo ""
echo "============================================================"
echo " Build complete!"
echo "  installer : dist/WetraceTool-Setup-*.exe"
echo "============================================================"
