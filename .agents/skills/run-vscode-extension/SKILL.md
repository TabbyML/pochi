---
name: run-vscode-extension
description: Launch the local Pochi VS Code extension in an isolated Extension Development Host and drive its webview UI (sidebar and task tabs) with real clicks and typing, read text/ARIA snapshots, take screenshots, run Command Palette commands, and read webview console and extension logs. Use when asked to run, open, debug, reproduce, or verify a change in the Pochi VS Code extension or its webview UI (packages/vscode, packages/vscode-webui) in a real VS Code window.
---

# Run the Pochi VS Code extension

Drive a real VS Code window running the local Pochi extension. The helpers
live in `.agents/skills/run-vscode-extension/scripts/` (paths below are
relative to the repo root):

- `env.sh`: **the entry point.** `up` builds, launches an isolated VS Code
  (`/tmp/pochi-vscode-debug-<port>`: fresh user-data dir, throwaway git
  workspace, CDP on port 9233), starts the `webview.mjs` daemon, and waits
  until Pochi is ready. `reload` rebuilds and reloads the window; `down` stops
  everything. All long-running processes run detached with logs, and every
  command returns, so no background-job support is needed from the agent.
- `webview.mjs`: Playwright CLI for the Pochi webviews and the workbench. A
  `serve` daemon holds the CDP connection, and the other commands talk to it.
  Run it with `node`, not `bun`. It uses the root devDependency
  `playwright-core` (no browser download), so run `bun install` first.
- `launch.sh`, `cleanup.sh`: low-level launch/teardown that `env.sh` drives.
  You don't need them directly.

This never touches the user's own VS Code windows. Pochi credentials are
global, so the isolated instance is already signed in; it starts with no tasks.

```bash
E=.agents/skills/run-vscode-extension/scripts/env.sh
w() { node .agents/skills/run-vscode-extension/scripts/webview.mjs "$@"; }
```

## 1. Start, rebuild, stop

```bash
$E up                 # build extension + prod webview, launch, wait until ready (~20s)
$E reload             # after code changes: rebuild and reload the window
$E down               # always, when done (also cancels a forgotten recording)
$E status             # what's running
```

Options for `up`:
- `--port N`: a different CDP port, for several instances in parallel. Pass
  the same `--port` to every `env.sh`, `webview.mjs`, and `record.mjs` call.
- `--dev`: serve the webview from Vite on :4112 with HMR (started if needed),
  so webview edits apply live without `reload`. Use it for quick UI iteration
  only: :4112 is one global port, so it refuses to start if Vite there belongs
  to another checkout. The default prod bundle is what users get; use it for
  verification and evidence.
- `--no-build`: skip the build when you just built. `--workspace DIR`: open
  that folder instead of a throwaway repo. `--inspect-extensions 9339`:
  expose the extension host for a breakpoint debugger.

`reload` rebuilds the extension, and in prod mode also the webview bundle.
In dev mode webview edits are already live, so only extension-side changes
(`packages/vscode/src`) need it.

On failure, `env.sh` prints the relevant log tail. All logs are in
`/tmp/pochi-vscode-env-<port>/` (`build.log`, `launch.log`, `serve.log`,
`vite.log`). A blank webview in dev mode usually means Vite isn't serving.

## 2. Drive the UI

Examples use the `w` function defined above (a function, because zsh does
not split variables).

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

- Palette commands: `w command "Developer: Reload Webviews"` reloads the
  webview UI (e.g. after Vite restarts). For a rebuilt extension use
  `$E reload`, which also waits for the sidebar to come back. The daemon
  survives both.
- Workbench UI: `w -w workbench snapshot 'role=tablist >> nth=0'`,
  `w -w workbench click 'role=tab[name=/^Explorer/]'`,
  `w -w workbench screenshot /tmp/window.png`.
- Webview and workbench console output (includes forwarded `[Extension Host]`
  messages): `w logs | grep -v 'Extension Host'`. The daemon buffers it from
  the moment it connected.
- The extension output channel ("Pochi") is
  `/tmp/pochi-vscode-debug-9233/user-data/logs/*/window1/exthost/TabbyML.pochi/Pochi.log`.
- For an extension host breakpoint debugger, start with `$E up --inspect-extensions 9339`.

## 4. Cleanup (always)

Run `$E down` (add `--keep-state` to keep the user-data dir and Pochi.log for
later inspection). It stops the daemon, VS Code, and the Vite server it
started.

## Gotchas

- **Wait in the right webview.** A submitted task runs in its task tab
  (`-w editor`); the sidebar only lists tasks ("Finished in 4s"), so
  `w wait-text 'Task Completed'` on the sidebar never matches. Use
  `w -w editor --timeout 60 wait-text 'Task Completed'`. Keep model waits
  short (30–90 s). When one times out, look before waiting again:
  `w list`, `w -w editor text | tail -30`.
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
- Use `--port` (on `env.sh`, `webview.mjs`, and `record.mjs`) to run several
  instances in parallel.
- agent-browser can drive the workbench (`agent-browser connect 9233`), but it
  cannot reach into the Pochi webview. VS Code nests the app two iframe
  levels deep, and agent-browser only enters one. Use `webview.mjs` for
  anything inside Pochi.
