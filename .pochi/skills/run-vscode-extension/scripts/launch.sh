#!/usr/bin/env bash
# Launch an isolated VS Code Extension Development Host for the local Pochi
# extension with a CDP endpoint. Blocks until the window is closed (uses
# `--wait`), so run it as a background job.
#
# Usage: launch.sh [--port 9233] [--workspace DIR] [--prod] [--inspect-extensions PORT]
#   --port                CDP port (default: $POCHI_VSCODE_CDP_PORT or 9233)
#   --workspace           folder to open (default: a throwaway git repo in the state dir)
#   --prod                POCHI_PROD_DEBUG=true: load the built webview from
#                         packages/vscode/assets/webview-ui/dist instead of Vite on :4112
#   --inspect-extensions  expose the extension host Node inspector on PORT
set -euo pipefail

port="${POCHI_VSCODE_CDP_PORT:-9233}"
workspace=""
prod=0
inspect=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port="$2"; shift 2 ;;
    --workspace) workspace="$2"; shift 2 ;;
    --prod) prod=1; shift ;;
    --inspect-extensions) inspect="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
state="/tmp/pochi-vscode-debug-$port"

if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $port is already in use; run cleanup.sh --port $port or pick another --port" >&2
  exit 1
fi

if [ ! -f "$repo/packages/vscode/dist/extension.js" ]; then
  echo "missing packages/vscode/dist/extension.js; run: (cd packages/vscode && bun run build:vscode)" >&2
  exit 1
fi

if [ "$prod" = 0 ] && ! curl -s -o /dev/null "http://localhost:4112/"; then
  echo "warning: Vite dev server is not reachable on :4112; the Pochi webview will be blank until it runs" >&2
  echo "         start it with: (cd packages/vscode-webui && bun run start), or relaunch with --prod" >&2
fi

code_bin="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
if [ ! -x "$code_bin" ]; then
  code_bin="$(command -v code || true)"
fi
if [ -z "$code_bin" ]; then
  echo "VS Code 'code' launcher not found" >&2
  exit 1
fi

rm -rf "$state"
mkdir -p "$state/user-data" "$state/extensions"
if [ -z "$workspace" ]; then
  workspace="$state/workspace"
  mkdir -p "$workspace"
  echo "# pochi debug workspace" > "$workspace/README.md"
  git -C "$workspace" init -q
fi

extra=()
if [ -n "$inspect" ]; then
  extra+=("--inspect-extensions=$inspect")
fi

# The `code` launcher must be used (not the Electron binary directly): shells
# spawned from VS Code inherit ELECTRON_RUN_AS_NODE, which breaks the latter.
unset ELECTRON_RUN_AS_NODE
if [ "$prod" = 1 ]; then
  export POCHI_PROD_DEBUG=true
fi

echo "state dir: $state"
echo "workspace: $workspace"
echo "cdp port:  $port"
echo "mode:      $([ "$prod" = 1 ] && echo prod-debug || echo dev)"

"$code_bin" --new-window "$workspace" \
  --extensionDevelopmentPath="$repo/packages/vscode" \
  --remote-debugging-port="$port" \
  --user-data-dir="$state/user-data" \
  --extensions-dir="$state/extensions" \
  --disable-workspace-trust \
  --skip-welcome \
  --skip-release-notes \
  ${extra[@]+"${extra[@]}"} \
  --wait || true

# `code --wait` also returns on "Developer: Reload Window"; stay alive until
# the VS Code instance itself is gone.
while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
  sleep 2
done
echo "VS Code on port $port exited"
