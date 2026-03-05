---
name: vscode
description: open vscode and debug pochi extension
---

# VS Code Extension Development & Debugging

Open a dedicated VS Code instance with the Pochi extension loaded in development mode, then automate or debug it using agent-browser via Chrome DevTools Protocol (CDP).

## Core Workflow

1. **Launch** a fresh VS Code instance with the extension under development and CDP enabled
2. **Connect** agent-browser to the CDP port
3. **Snapshot** to discover interactive elements in the workbench frame
4. **Interact** using element refs or pixel coordinates (for sandboxed webviews)
5. **Re-snapshot** after navigation or state changes

## Launching VS Code for Extension Development

> **Important:** Use the `code` binary directly — do NOT use `open -a "Visual Studio Code"`.
> When VS Code is already running, `open -a` attaches to the existing instance and silently ignores all flags (including `--remote-debugging-port`).

```bash
POCHI_PROD_DEBUG=true "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --new-window "$(pwd)/assets" \
  --extensionDevelopmentPath="$(pwd)/packages/vscode" \
  --remote-debugging-port=9223 \
  --user-data-dir="$(mktemp -d)" \
  --disable-workspace-trust
```

**Important flags:**
- `--new-window` — always open a new, isolated VS Code window
- `--extensionDevelopmentPath` — load the local extension from source
- `--remote-debugging-port=9223` — expose the CDP endpoint for agent-browser
- `--user-data-dir=$(mktemp -d)` — use a fresh, isolated profile so no previous state interferes
- `--disable-workspace-trust` — skip the workspace trust prompt
- `POCHI_PROD_DEBUG=true` — enable verbose extension logging for debugging

## Connecting agent-browser

```bash
# Verify the port is open (VS Code takes a few seconds to start)
sleep 5 && lsof -i :9223

# Connect agent-browser
agent-browser connect 9223

# Standard workflow from here
agent-browser snapshot -i    # inspect workbench elements
agent-browser screenshot vscode-desktop.png
```

Or use `--cdp` per-command without a persistent session:

```bash
agent-browser --cdp 9223 snapshot -i
```

## Tab / WebView Management

VS Code only exposes its main workbench as a `page`-type CDP target. The Pochi extension panel is a `vscode-webview://`-origin iframe that is **not** reachable via `agent-browser tab`. Use `agent-browser tab` only to confirm the single workbench target:

```bash
# List available targets (typically just one: the workbench page)
agent-browser tab
```

To inspect all raw CDP targets including iframes and workers:

```bash
curl -s http://localhost:9223/json | python3 -m json.tool | grep -E '"title"|"type"|"url"'
```

## Opening the Pochi Panel

The Pochi activity bar tab appears as `"Pochi"` in the snapshot. Click it to toggle the Pochi primary sidebar open/closed:

```bash
agent-browser connect 9223
agent-browser snapshot -i | grep -i pochi   # find the tab ref, e.g. e17
agent-browser click e17                      # open Pochi panel
agent-browser screenshot pochi-open.png
```

## Interacting with the Pochi Panel (Sandboxed Webview)

The Pochi webview is a `vscode-webview://`-origin iframe. Its contents **cannot** be inspected or interacted with via `agent-browser snapshot`, `agent-browser frame`, or `agent-browser eval` due to two compounding limitations:

1. **`agent-browser frame` is currently broken** ([issue #50](https://github.com/vercel-labs/agent-browser/issues/50), [issue #318](https://github.com/vercel-labs/agent-browser/issues/318)): the command sets an internal `activeFrame` but all subsequent action handlers (`snapshot`, `eval`, `screenshot`, etc.) still operate on the parent page. Community PRs fixing this exist but are not yet merged.

2. **VS Code webview origin isolation**: Even if `frame` were fixed, the Pochi content is rendered inside a `vscode-webview://` origin iframe that is not part of the page's Playwright frame tree. `contentFrame()` returns the workbench's own frame, not the Pochi React app.

The only reliable way to interact with the Pochi panel is via **screenshots + pixel-coordinate mouse clicks**:

```bash
# Take a screenshot to see current state and determine coordinates
agent-browser screenshot pochi-panel.png

# Click at the coordinates of the "Ask anything..." textarea (~190, 140)
agent-browser mouse move 190 140
agent-browser mouse down
agent-browser mouse up

# Take another screenshot to confirm the interaction
agent-browser screenshot pochi-panel-after.png
```

> **When `agent-browser frame` gets fixed upstream**, same-origin iframes will work. For VS Code webviews the origin isolation will still apply and screenshots + coordinates will remain the approach.

## Common Patterns

### Inspect the Workbench UI

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --new-window "$(pwd)/assets" \
  --extensionDevelopmentPath="$(pwd)/packages/vscode" \
  --remote-debugging-port=9223 \
  --user-data-dir="$(mktemp -d)" \
  --disable-workspace-trust

sleep 5
agent-browser connect 9223
agent-browser snapshot -i          # inspect all workbench elements
```

### Take Screenshots

```bash
agent-browser connect 9223
agent-browser screenshot vscode-desktop.png
agent-browser screenshot --full full-vscode.png
agent-browser screenshot --annotate annotated-vscode.png
```

### Open and Inspect the Pochi Sidebar

```bash
agent-browser connect 9223
agent-browser snapshot -i | grep -i pochi   # find the Pochi tab ref
agent-browser click e17                      # click the Pochi activity bar tab
agent-browser screenshot pochi-open.png
```

### Named Session (multi-window)

```bash
agent-browser --session vscode connect 9223
agent-browser --session vscode snapshot -i
agent-browser --session vscode screenshot vscode.png
```

## Closing / Cleanup

Find and kill the VS Code process using the CDP port:

```bash
# Show process info
ps $(lsof -ti :9223)

# Kill gracefully, then force if needed
kill $(lsof -ti :9223)
sleep 1
kill -9 $(lsof -ti :9223) 2>/dev/null || echo "Process stopped"
```

## Troubleshooting

### Port 9223 not open after launch

- `open -a "Visual Studio Code"` will NOT work if VS Code is already running — it reuses the existing instance and drops all flags. Always use the `code` binary directly.
- Add `sleep 5` after launch; VS Code takes a few seconds to expose the CDP port.
- Verify: `lsof -i :9223`

### `agent-browser tab` shows only one target

This is expected. VS Code exposes only the main workbench window as a `page`-type CDP target. Extension webviews are `iframe`-type targets and cannot be switched to with `agent-browser tab`.

### Pochi panel elements not in snapshot

The Pochi webview is a sandboxed iframe — its DOM is not accessible via `agent-browser snapshot`. Use `agent-browser mouse move/down/up` at the coordinates of the element to interact with it, and `agent-browser screenshot` to verify the result.

### `agent-browser frame` doesn't expose Pochi webview contents

Two reasons:
1. **`agent-browser frame` is a known-broken feature** ([issue #50](https://github.com/vercel-labs/agent-browser/issues/50), [issue #318](https://github.com/vercel-labs/agent-browser/issues/318)): `frame <sel>` reports success but `snapshot`, `eval`, and all other commands continue to operate on the parent page — the `activeFrame` is never used by action handlers. This is a bug in agent-browser; fix PRs are open but not yet merged.
2. **VS Code webview origin isolation**: Even if the bug were fixed, VS Code renders extension panels in `vscode-webview://`-origin iframes. `contentFrame()` returns the workbench frame (same-origin outer page), not the Pochi React app running inside it.

Use screenshots + pixel-coordinate `mouse move/down/up` to interact with the Pochi panel.

### Elements not appearing in snapshot

- Use `agent-browser snapshot -i -C` to include cursor-interactive elements (divs with `onclick` handlers)
- Make sure the correct panel is open and visible on screen

### Extension not loading

- Confirm `--extensionDevelopmentPath` points to the built extension directory (e.g. `$(pwd)/packages/vscode`)
- Make sure the extension has been built: run `bun run build` inside `packages/vscode` if needed
- Check `POCHI_PROD_DEBUG=true` output in the VS Code Developer Console (Help → Toggle Developer Tools)
