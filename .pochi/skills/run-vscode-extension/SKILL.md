---
name: run-vscode-extension
description: Launch the local Pochi VS Code extension in an isolated Extension Development Host and drive its webview UI (sidebar and task tabs) with real clicks and typing, read text/ARIA snapshots, take screenshots, run Command Palette commands, and read webview console and extension logs. Use when asked to run, open, debug, reproduce, or verify a change in the Pochi VS Code extension or its webview UI (packages/vscode, packages/vscode-webui) in a real VS Code window.
---

# Run the Pochi VS Code extension

Drive a real VS Code window running the local Pochi extension. Three helpers
live in `.pochi/skills/run-vscode-extension/scripts/` (paths below are
relative to the repo root):

- `launch.sh`: starts an isolated VS Code (`/tmp/pochi-vscode-debug-<port>`,
  fresh user-data dir, throwaway git workspace) with CDP on port 9233.
- `webview.mjs`: Playwright CLI for the Pochi webviews and the workbench. A
  `serve` daemon holds the CDP connection, and the other commands talk to it.
  Run it with `node`, not `bun`. It uses the root devDependency
  `playwright-core` (no browser download), so run `bun install` first.
- `cleanup.sh`: closes that VS Code and deletes its state dir.

This never touches the user's own VS Code windows. Pochi credentials are
global, so the isolated instance is already signed in; it starts with no tasks.

## 1. Build and start

1. If extension-side code (`packages/vscode/src`) changed, rebuild it:
   `cd packages/vscode && bun run build:vscode`. For repeated edits, run
   `bun run watch:vscode` there as a background job instead. Don't use
   `watch`: it also starts Vite. Either way, apply the new build with
   `w command "Developer: Reload Window"`.
2. Choose how the webview is served:
   - **Dev (default)**: Vite with HMR. If nothing is listening on :4112, start
     `cd packages/vscode-webui && bun run start` as a background job. Webview
     edits then apply live.
   - **Prod** (`--prod`): the built bundle in
     `packages/vscode/assets/webview-ui/dist`. Rebuild it with
     `cd packages/vscode-webui && bun run build && cd ../vscode && bun run copy:assets`.
3. Start both as **background jobs**:
   ```bash
   .pochi/skills/run-vscode-extension/scripts/launch.sh            # [--prod] [--port N] [--workspace DIR]
   node .pochi/skills/run-vscode-extension/scripts/webview.mjs serve # same --port if changed
   ```
4. Wait until Pochi is ready (this opens the Pochi sidebar):
   ```bash
   node .pochi/skills/run-vscode-extension/scripts/webview.mjs wait-ready
   ```
   On failure, read the `launch.sh` and `serve` job output. Common causes are
   Vite not running (blank webview) or a missing `dist/extension.js`.

## 2. Drive the UI

All examples below use the alias `w="node .pochi/skills/run-vscode-extension/scripts/webview.mjs"`.
zsh does not split variables, so in commands use a function:
`w() { node .pochi/skills/run-vscode-extension/scripts/webview.mjs "$@"; }`.

```bash
w snapshot                                   # ARIA tree of the sidebar: start here
w click label=model-select
w snapshot role=menu
w click 'role=menuitemradio[name="google/gemini-3.5-flash-lite"]'
w fill .ProseMirror 'Reply with exactly PONG'
w click label=Submit
w list                                       # a task tab appears as an editor webview
w -w editor --timeout 120 wait-text 'Task Completed'
w -w editor text
w -w editor screenshot /tmp/task.png         # then readFile /tmp/task.png
```

- **Webview target `-w`**: `sidebar` (default; reopened automatically if hidden),
  `editor` (the visible Pochi task tab), an index from `list`, or `workbench`
  (the VS Code UI itself).
- **Locators** are Playwright selectors, plus `label=<exact aria-label>`.
  Examples: `role=button[name="Submit"]`, `text=Task Completed`,
  `[aria-label="Add"]`, `... >> nth=0`. Clicks wait for actionability; if
  several elements match, the command fails, so narrow the selector.
- **Commands**: `snapshot [loc]`, `click`, `hover`, `fill`, `type` (real
  keystrokes), `press <key> [loc]`, `text [loc]`, `count`, `wait`, `wait-text`,
  `eval <js-expression>`, `screenshot <file>`, `command <palette title>`,
  `logs [--clear]`, `list`, `status`. Run `w --help` for the full list.
- **Multi-step or conditional flows**: `w run /tmp/flow.mjs`. The script's
  default export receives `{ page, frame, webviews, locator, log }`. Use `log()`
  for output, because `console.log` goes to the daemon's job log.

Known Pochi labels: `Add`, `model-select`, `Submit` (sidebar),
`filter-tasks-button`, `worktree-more-actions`. The prompt editor is
`.ProseMirror`, model options are `menuitemradio`, and other menus use
`menuitem`. Prefer `snapshot` over guessing. If a label you need is missing,
add an `aria-label` in the component.

## 3. Workbench, reloads, and logs

- Palette commands: `w command "Developer: Reload Webviews"` (reload the webview
  UI, e.g. after Vite restarts) or `w command "Developer: Reload Window"`
  (after rebuilding the extension). The daemon survives both.
- Workbench UI: `w -w workbench snapshot 'role=tablist >> nth=0'`,
  `w -w workbench click 'role=tab[name=/^Explorer/]'`,
  `w -w workbench screenshot /tmp/window.png`.
- Webview and workbench console output (includes forwarded `[Extension Host]`
  messages): `w logs | grep -v 'Extension Host'`. The daemon buffers it from
  the moment it connected.
- The extension output channel ("Pochi") is
  `/tmp/pochi-vscode-debug-9233/user-data/logs/*/window1/exthost/TabbyML.pochi/Pochi.log`.
- For an extension host breakpoint debugger, launch with `--inspect-extensions 9339`.

## 4. Cleanup (always)

1. Kill the `serve` background job. It also exits on its own when VS Code closes.
2. Run `.pochi/skills/run-vscode-extension/scripts/cleanup.sh` (`--keep-state`
   keeps the logs). The `launch.sh` job then ends.
3. Kill any Vite or watch job you started.

## Gotchas

- Playwright cannot see into webviews that were loaded before it connected. For
  this reason everything goes through the long-lived `serve` daemon. On
  startup it runs "Developer: Reload Webviews" once if needed. This resets
  transient UI state (open menus, unsent text), but tasks persist. Don't
  restart the daemon mid-flow. If `list` reports untracked webviews, run
  `w command "Developer: Reload Webviews"`.
- After dependency or lockfile changes, Vite re-optimizes on the first load
  and forces a full reload ("optimized dependencies changed. reloading" in the
  Vite log). This blanks the webviews (`list` shows `blank`, and a pushState
  SecurityError appears in `logs`). Once the Vite log is quiet, run
  `w command "Developer: Reload Webviews"`.
- An open menu or dialog blocks clicks elsewhere: Playwright reports
  "... intercepts pointer events". Press `Escape` or pick an item first.
- `press <key>` without a locator goes to whatever has focus. Pass a locator to
  target an element.
- In dev mode the TanStack Router devtools badge overlaps the top-left of the
  webview. It is expected.
- Use `--port` (on all three scripts) to run several instances in parallel.
- agent-browser can drive the workbench (`agent-browser connect 9233`), but it
  cannot reach into the Pochi webview. VS Code nests the app two iframe
  levels deep, and agent-browser only enters one. Use `webview.mjs` for
  anything inside Pochi.
