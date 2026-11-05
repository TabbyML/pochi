---
name: record-vscode-extension
description: Record a run of the local Pochi VS Code extension as one shareable Jam link (video of the window, step marks and ✅/❌ checks as timestamped comments, a description with verdict, summary, and git state, and a console that holds the Pochi webview console and Pochi.log). Use together with run-vscode-extension when a run in packages/vscode or packages/vscode-webui should be captured and shared, e.g. a demo video for a pull request, evidence for a regression test document, or a reproduction for a bug report.
---

# Record a Pochi VS Code extension run as a Jam

This skill turns a run into **one Jam link**: a video of the window,
timestamped comments, a description, and logs. It does not start VS Code or
drive the UI. That is the `run-vscode-extension` skill: launch the instance
and run `wait-ready` with it first, then drive the UI with its `webview.mjs`
as usual while this skill records.

`record.mjs` lives in `.pochi/skills/record-vscode-extension/scripts/`. Run it
with `node`, and pass the same `--port` as the instance (default 9233). The
examples use these functions:

```bash
r() { node .pochi/skills/record-vscode-extension/scripts/record.mjs "$@"; }
w() { node .pochi/skills/run-vscode-extension/scripts/webview.mjs "$@"; }
```

## When to use

Record when someone other than you needs to see the run. Wherever the link
goes, show the outcome next to it, for example
`[▶ Model menu: select a model](https://jam.dev/c/...) ✅ PASS, 3/3 checks`.

- **Pull request.** When you create or update a PR for a UI or extension
  change, record the changed behavior and put the link in the PR body (a
  "Demo" or "Test plan" section), so reviewers can watch it instead of
  checking out the branch.
  - New PR: include the link in the `gh pr create --body`. Then link the Jam
    back with `jam update jam <id> --resource <pr-url> --label PR`.
  - Existing PR: pass `--resource <pr-url> --resource-label PR` to `stop`.
    Then append the link to the body:
    `gh pr view <n> --json body -q .body > /tmp/body.md`, edit the file, and
    run `gh pr edit <n> --body-file /tmp/body.md`.
  - After pushing more changes that alter the behavior, record again and
    replace the link.
- **Regression testing.** For a test document or checklist, record each case
  (or each flow) as its own Jam. Use the case name as the title, and add a
  `check` for each expected result. In the document, next to the case, write
  the link, the verdict, and the commit. Group a run with
  `jam update jam <id> --folder "Regression <version or date>"`. A failed
  case's Jam is already the evidence for its bug report.
- **Bug report.** Record the reproduction with a `check` that shows the wrong
  behavior, so the Jam ends as ❌ FAIL. Put the link in the issue (see the
  `create-issue` skill), and attach the issue to the Jam with
  `--resource <issue-url>`. After the fix, record the same steps again and
  link the two:
  `jam update jam <fix-jam> --mark-related <bug-jam> --type fixes`.
- **Review or demo.** To show how a change behaves, including someone else's
  PR you are reviewing, record before and after (e.g. `main` and the PR
  branch). Link the two Jams with `--mark-related ... --type relates_to`.

Don't record for quick checks that only you need; `run-vscode-extension` is
enough there.

## Setup (once per machine)

Install the Jam CLI with `curl -fsSL https://native.jam.dev/install | bash`.
It lands in `~/.local/bin/jam`; `JAM_BIN` overrides the path. Then ask the
user to run `jam auth login`, which opens a browser. Without the CLI, `start`
fails with this hint.

## Flow

```bash
r start "Model menu: select a model"           # Jam title; recorder runs in the background
r mark "1. Open the model menu"                # step marker, becomes a comment
w click label=model-select
r check "model menu opens" -- wait role=menu   # ✅/❌ comment; exits 1 on failure
w click 'role=menuitemradio[name="google/gemini-3.5-flash-lite"]'
r check "model is selected" -- wait '[aria-label="model-select"] >> text=gemini-3.5-flash-lite'
r check "menu closed" --expect 0 -- count role=menu
r check "icon renders crisply" --pass --note "screenshot /tmp/icon.png reviewed"
r stop --summary-file /tmp/summary.md \
  --resource https://github.com/TabbyML/pochi/pull/123 --resource-label PR
# ✓ Jam: https://jam.dev/c/...   <- give this link to the user
```

- **`mark <label>`** puts a comment at this point of the video. Use it to
  label the steps.
- **`check <name> -- <webview.mjs args>`** runs that webview.mjs command
  (`wait`, `count`, `text`, `eval`, ...; `--timeout` is in seconds and goes
  after `--`) and adds a ✅/❌ comment. It passes when the command exits 0.
  With `--expect <output>`, the command's trimmed stdout must also equal
  `<output>`. Scope locators so they cannot match your own prompt text.
- **`check <name> --pass|--fail [--note <text>]`** records an outcome observed
  another way: reading a screenshot, a file, or a log.
- `check` also works without a recording. It then only prints the result and
  sets the exit code.
- **`stop`** uploads the recording and prints the link. `--verdict pass|fail`
  defaults to `fail` if any check failed, otherwise `pass` if there were
  checks. Use `--summary <md>` or `--summary-file <file>` to describe what the
  recording shows. Use bullet lists, because Jam drops tables. The
  description also gets the check list, the git branch, commit, and
  uncommitted diff stat, and whether the webview ran from Vite (dev) or the
  prod bundle.
- `cancel` discards the recording; `status` shows it. One recording per port.

## What the Jam contains

- **Video**: `start --video screencast` (default) captures the workbench page
  through CDP, webviews included, even while the window is covered. It needs
  no permissions but misses native menus and dialogs. `--video screen`
  records the window itself and needs macOS Screen Recording permission for
  the app running the command.
- **Comments**: each `mark` and `check` at its point in the video. A failed
  check includes the command and its error output.
- **Console**: `[mark]` and `[check ✓/✗]` lines, `[webview]` Pochi webview
  console and uncaught errors (sidebar and task tabs), and `[ext]` Pochi.log
  lines, next to the workbench's own console. Read it back with
  `jam get console <id> [--level error]`. Read the video with
  `jam get frames <id> --overview` (right after upload it may report
  STILL_PROCESSING; retry later).

## Notes

- The recorder is a detached process with its own CDP connection, so it does
  not disturb the `webview.mjs serve` daemon and needs no webview reload. Its
  output goes to `/tmp/pochi-vscode-debug-<port>/record.log`.
- Reload Webviews, Reload Window, and restarting the `serve` daemon are fine
  mid-recording. If VS Code exits, the recording is cancelled and the
  recorder exits.
- Before cleanup, `stop` or `cancel` the recording. `cleanup.sh` closes VS
  Code, which cancels a forgotten recording.
- Labels starting with `1.` are rewritten to `[1]`, because Jam renders them
  as a markdown list.
