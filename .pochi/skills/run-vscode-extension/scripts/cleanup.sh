#!/usr/bin/env bash
# Close the VS Code instance started by launch.sh and remove its state dir.
# Usage: cleanup.sh [--port 9233] [--keep-state]
set -uo pipefail

port="${POCHI_VSCODE_CDP_PORT:-9233}"
keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port="$2"; shift 2 ;;
    --keep-state) keep=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if command -v agent-browser >/dev/null 2>&1; then
  agent-browser --session "pochi-vscode-$port" close >/dev/null 2>&1 || true
elif [ -x "$HOME/.pochi/bin/agent-browser" ]; then
  "$HOME/.pochi/bin/agent-browser" --session "pochi-vscode-$port" close >/dev/null 2>&1 || true
fi

pattern="remote-debugging-port=$port"
pkill -f "$pattern" 2>/dev/null
for _ in 1 2 3 4 5; do
  pgrep -f "$pattern" >/dev/null || break
  sleep 1
done
pkill -9 -f "$pattern" 2>/dev/null

if pgrep -f "$pattern" >/dev/null; then
  echo "✗ VS Code processes still running for port $port" >&2
  exit 1
fi
echo "✓ VS Code on port $port closed"

state="/tmp/pochi-vscode-debug-$port"
if [ "$keep" = 1 ]; then
  echo "kept state dir: $state"
else
  rm -rf "$state"
  echo "✓ removed $state"
fi
