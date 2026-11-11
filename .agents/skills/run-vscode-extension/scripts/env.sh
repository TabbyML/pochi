#!/usr/bin/env bash
# The entry point for the Pochi VS Code environment: build, launch an isolated
# VS Code with the local extension, start the webview.mjs daemon, and tear it
# all down again. Every long-running process is started detached (nohup) with
# logs and pid files, and each command returns when it is done, so it works the
# same from any agent (Pochi, Pi, Codex, ...) or a plain shell.
#
# Usage:
#   env.sh up     [--port N] [--dev] [--no-build] [--workspace DIR] [--inspect-extensions PORT]
#                 build, launch VS Code, start the daemon, wait until Pochi is ready
#   env.sh reload [--port N] [--no-build]
#                 rebuild (extension, and the webview in prod mode) and reload the window
#   env.sh down   [--port N] [--keep-state]
#                 stop everything started by `up` (cancels a forgotten recording)
#   env.sh status [--port N]
#
#   --port       CDP port (default $POCHI_VSCODE_CDP_PORT or 9233). Use a distinct
#                port per parallel instance.
#   --dev        serve the webview from Vite on :4112 with HMR (started if needed).
#                Default: the prod bundle, what users get. :4112 is one global
#                port, so prod is the only mode that is safe in several worktrees.
#   --no-build   skip the build step (you just built).
#   --workspace  folder to open (default: a throwaway git repo).
#   --inspect-extensions  expose the extension host Node inspector on PORT.
#   --keep-state keep /tmp/pochi-vscode-debug-<port> (user data, Pochi.log).
#
# Logs and pid files: /tmp/pochi-vscode-env-<port>/ (build.log, vite.log,
# launch.log, serve.log). launch.sh and cleanup.sh are the low-level pieces
# this script drives; use them directly only for unusual setups.
set -euo pipefail

cmd="${1:-}"; shift || true
port="${POCHI_VSCODE_CDP_PORT:-9233}"
dev=0
build=1
keep=""
launch_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port="$2"; shift 2 ;;
    --dev) dev=1; shift ;;
    --no-build) build=0; shift ;;
    --keep-state) keep="--keep-state"; shift ;;
    --workspace|--inspect-extensions) launch_args+=("$1" "$2"); shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
run="$(cd "$(dirname "$0")" && pwd)"
dir="/tmp/pochi-vscode-env-$port"
w() { node "$run/webview.mjs" --port "$port" "$@"; }

is_alive() { [ -f "$dir/$1.pid" ] && kill -0 "$(cat "$dir/$1.pid")" 2>/dev/null; }

start_detached() { # name, command...
  local name="$1"; shift
  nohup "$@" >"$dir/$name.log" 2>&1 </dev/null &
  echo $! >"$dir/$name.pid"
}

kill_tree() { # name
  [ -f "$dir/$1.pid" ] || return 0
  local pid; pid="$(cat "$dir/$1.pid")"
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  rm -f "$dir/$1.pid"
}

do_build() {
  [ "$build" = 1 ] || return 0
  [ -d "$repo/node_modules" ] || (cd "$repo" && bun install)
  echo "→ building extension"
  (cd "$repo/packages/vscode" && bun run build:vscode) >"$dir/build.log" 2>&1 \
    || { echo "✗ extension build failed, see $dir/build.log" >&2; tail -30 "$dir/build.log" >&2; exit 1; }
  if [ "$dev" = 0 ]; then
    echo "→ building webview (prod bundle)"
    (cd "$repo/packages/vscode-webui" && bun run build:default && cd ../vscode && bun run copy:assets) >>"$dir/build.log" 2>&1 \
      || { echo "✗ webview build failed, see $dir/build.log" >&2; tail -30 "$dir/build.log" >&2; exit 1; }
  fi
}

ensure_vite() {
  local pid
  pid="$(lsof -nP -iTCP:4112 -sTCP:LISTEN -t 2>/dev/null | head -1 || true)"
  if [ -n "$pid" ]; then
    local cwd
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    if [ "$cwd" != "$repo/packages/vscode-webui" ]; then
      echo "✗ :4112 is served by another checkout ($cwd). Use the prod mode (drop --dev) or stop that Vite." >&2
      exit 1
    fi
    return 0
  fi
  echo "→ starting Vite on :4112"
  (cd "$repo/packages/vscode-webui" && start_detached vite bun run start)
  for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:4112/ && return 0; sleep 1; done
  echo "✗ Vite did not come up, see $dir/vite.log" >&2; exit 1
}

case "$cmd" in
  up)
    mkdir -p "$dir"
    if is_alive launch; then echo "already up on port $port (env.sh down --port $port first)"; exit 0; fi
    # Never attach to (and later tear down) a VS Code we did not start.
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "✗ port $port is already in use by another process; pick another --port" >&2
      exit 1
    fi
    do_build
    [ "$dev" = 1 ] && ensure_vite
    echo "$dev" >"$dir/mode"
    echo "→ launching VS Code (port $port, $([ "$dev" = 1 ] && echo dev || echo prod))"
    [ "$dev" = 1 ] || launch_args+=(--prod)
    start_detached launch "$run/launch.sh" --port "$port" ${launch_args[@]+"${launch_args[@]}"}
    up=0
    for _ in $(seq 1 60); do
      is_alive launch || { echo "✗ launch failed:" >&2; cat "$dir/launch.log" >&2; exit 1; }
      if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then up=1; break; fi
      sleep 1
    done
    [ "$up" = 1 ] || { echo "✗ VS Code did not open port $port, see $dir/launch.log" >&2; kill_tree launch; exit 1; }
    start_detached serve node "$run/webview.mjs" --port "$port" serve
    if ! w wait-ready 120; then
      echo "✗ Pochi did not become ready. Logs:" >&2
      tail -20 "$dir/launch.log" "$dir/serve.log" >&2
      exit 1
    fi
    echo "✓ ready: port $port, logs in $dir"
    ;;
  reload)
    [ -f "$dir/mode" ] && dev="$(cat "$dir/mode")"
    do_build
    w command "Developer: Reload Window"
    sleep 3
    # The daemon stays "ready" across a window reload, so wait for the Pochi
    # sidebar itself to render again (any sidebar command reopens it).
    for _ in $(seq 1 30); do
      if w --timeout 5 wait 'label=model-select' >/dev/null 2>&1; then
        w list
        echo "✓ reloaded"
        exit 0
      fi
      sleep 2
    done
    echo "✗ Pochi sidebar did not come back after reload; see $dir/serve.log" >&2
    exit 1
    ;;
  down)
    # Discard a forgotten recording (no-op when nothing is recording).
    node "$run/../../record-vscode-extension/scripts/record.mjs" --port "$port" cancel >/dev/null 2>&1 || true
    kill_tree serve
    "$run/cleanup.sh" --port "$port" $keep || true
    kill_tree launch
    kill_tree vite
    echo "✓ down (logs kept in $dir)"
    ;;
  status)
    for p in vite launch serve; do
      if is_alive "$p"; then echo "$p: running (pid $(cat "$dir/$p.pid"))"; else echo "$p: stopped"; fi
    done
    is_alive serve && w status || true
    ;;
  *)
    sed -n '2,29p' "$0"; exit 2 ;;
esac
