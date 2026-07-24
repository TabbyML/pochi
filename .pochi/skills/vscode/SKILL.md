---
name: vscode
description: open vscode and debug pochi extension
---

# VS Code Extension Development & Debugging

Open a dedicated VS Code instance with the Pochi extension loaded in development mode, then automate or debug it using agent-browser via Chrome DevTools Protocol (CDP).

## Core Workflow

1. **Launch** a fresh VS Code instance with the extension under development and CDP enabled
2. **Connect** agent-browser to the CDP port
3. **Snapshot** to discover interactive elements — iframe content (including the Pochi webview) is traversed automatically since v0.21.0
4. **Interact** using element refs from the snapshot; fall back to pixel-coordinate mouse clicks if an element is not in the snapshot
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

VS Code only exposes its main workbench as a `page`-type CDP target. The Pochi extension panel is a `vscode-webview://`-origin iframe. Use `agent-browser tab` only to confirm the single workbench target:

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

As of **agent-browser v0.21.0**, iframe support is built-in — `snapshot`, `click`, `fill`, and all other interaction commands **automatically traverse into iframe content** without any special `frame` command. This means the Pochi webview panel can now be inspected and interacted with directly:

```bash
agent-browser connect 9223
agent-browser snapshot -i          # includes elements inside the Pochi webview iframe
agent-browser click e42            # click an element inside the iframe by ref
agent-browser fill e43 "hello"     # fill a textarea inside the iframe
agent-browser screenshot pochi-panel.png
```

> **Note on VS Code webview origin isolation:** The Pochi panel runs inside a `vscode-webview://`-origin iframe. Agent-browser's iframe traversal works at the CDP level and is not blocked by same-origin restrictions, so `snapshot` will include Pochi's React UI elements.

If elements inside the webview are still not appearing in the snapshot (e.g. due to the panel not being fully rendered), fall back to **screenshots + pixel-coordinate mouse clicks**:

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

# After opening the panel, snapshot again — iframe content is now traversed automatically
agent-browser snapshot -i                    # should include Pochi webview elements
```

### Type a Message into the Pochi Chat

```bash
agent-browser connect 9223
# Find the chat input ref inside the webview (traversed automatically in v0.21.0+)
agent-browser snapshot -i | grep -i "ask\|input\|textarea"
agent-browser fill e55 "Hello from agent-browser"   # fill the chat input
agent-browser screenshot pochi-chat.png
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

As of agent-browser v0.21.0, `snapshot` automatically traverses into iframes. If Pochi webview elements are still missing:
- Ensure the Pochi panel is fully open and visible before snapshotting
- Try `agent-browser snapshot -i -C` to include cursor-interactive elements
- As a fallback, use `agent-browser screenshot` to get coordinates and interact via `agent-browser mouse move/down/up`

### Elements not appearing in snapshot

- Use `agent-browser snapshot -i -C` to include cursor-interactive elements (divs with `onclick` handlers)
- Make sure the correct panel is open and visible on screen

### Extension not loading

- Confirm `--extensionDevelopmentPath` points to the built extension directory (e.g. `$(pwd)/packages/vscode`)
- Make sure the extension has been built: run `bun run build` inside `packages/vscode` if needed
- Check `POCHI_PROD_DEBUG=true` output in the VS Code Developer Console (Help → Toggle Developer Tools)
