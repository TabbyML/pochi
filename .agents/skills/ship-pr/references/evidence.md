# Evidence levels

Decide the level at the start of the run (step 1). Pick the highest level that
applies. Moving up later is fine if the change turns out bigger.

| Level | When | Required evidence |
| --- | --- | --- |
| **L0** | No user-visible change: pure logic, refactor, extension-side behavior with no UI change, build/chore, docs | Static checks + automated tests (new or existing) that cover the change |
| **L1** | Visible but static UI change: layout, styling, copy, icons, a new state rendered | L0 + screenshots from a real VS Code. If something existed before: before/after + `visual-diff.mjs` compare image |
| **L2** | Interaction or multi-step flow: menus, navigation, task lifecycle, model/tool calls, background jobs, anything timing-related, or a hard-to-see bug | L0 + a Jam recording with `check` assertions (`record-vscode-extension`), plus key-state screenshots |

Bug fixes, at any level: reproduce first, then show the fix.
- L0 bug: a test that fails before the fix and passes after. Say so in the PR.
- L1/L2 bug: capture the broken state *before changing code* (screenshot, or a
  Jam whose check fails with ❌), then the same steps after the fix (✅). For
  Jam, link the two: `jam update jam <fix-jam> --mark-related <bug-jam> --type fixes`.
- If the bug can't be reproduced locally, don't guess a fix silently. Say in the
  PR why it could not be reproduced and what the fix is based on (logs, code
  reading).

Features and other changes don't need a "before". For L1 UI changes to an
existing view, a before/after compare is still the clearest evidence.

## Test cases

Write test cases (TCs) when the change has behavior a person would check by
hand (most L1/L2). Skip them for L0 changes whose unit tests already state the
behavior. Format, one per line in the PR:

```
TC-1: <Given> → <When> → <Then, observable result>   ✅ / ❌   <how: unit test name | Jam check | screenshot>
```

Write them before implementing; they become the `check`s of the recording and
the PR's test plan. If the requirement comes with TC IDs (e.g. from a testing
doc, "TC-23"), reuse those IDs. Phrase the Given/When as what a user is doing
("Given a task that is running `bun run test` in the background → When the
user closes the task tab"), not as test setup ("Given job #1 → When kill").

## Make it look like real use

Reviewers judge the change from the screenshots and recordings, so stage them
as a scene a real user would hit, not as an obvious test fixture. Everything
in the scene still has to really happen; this is about choosing realistic
inputs, not faking output.

- **Workspace**: a real project, not the throwaway `# pochi debug workspace`
  repo. Use the disposable clone `$WS` of this repo (SKILL.md step 1); the
  agent in the scene may edit it freely.
- **Prompts**: what a developer would actually ask in that project, sized to
  trigger the behavior under test. E.g. "Find where task titles are
  generated and explain how long ones are truncated", "Run the vscode-webui
  unit tests in the background and summarize any failures", "Add a
  `formatDuration` helper to packages/common with tests". Never "Reply with
  exactly PONG", "test", "hello", "asdf", or "call tool X now".
- **Commands and data**: real commands (`bun run test`, `bun tsc`, a dev
  server) instead of `sleep 30; echo done`; real file paths, plausible task
  titles, names, and lengths. Use a synthetic command (`sleep`, `exit 1`)
  only when the behavior needs exact control (a precise duration, a failure)
  that no real command gives, and say why in the TC.
- **Bugs**: replay the reporter's scenario (their prompt, file type, language,
  steps) when the issue gives one; for a Chinese-path bug, use Chinese file
  names a user would have, not `测试.txt`.
- **Clean scene**: no leftover tasks, failed attempts, error toasts, or
  unrelated tabs/panels from earlier tries. Restart (`$E up`) if needed.
- **Assert structure, not exact model text** (`w wait` on the tool card,
  status, or element; `wait-text` on UI labels), so prompts can stay
  natural. Give model-driven steps a generous `--timeout`.
- **Same scene before and after.** The reproduction and the fix use the same
  workspace, prompt, and steps. Reset the clone between runs if the scene
  edited it: `git -C $WS reset -q --hard && git -C $WS clean -fdq`.

Before uploading, look at each image and ask: would this pass as a user's own
screenshot of their work? If it shows placeholder text, a debug README, or a
prompt no one would type, reshoot it.

## Capturing in VS Code

Environment: `run-vscode-extension`'s `env.sh up` (prod webview bundle by
default). Drive the UI with `run-vscode-extension`'s `webview.mjs` (`w`), record with
`record-vscode-extension`'s `record.mjs` (`r`). Read both skills' SKILL.md
first.

- Real model calls are fine. The local Pochi account is already signed in.
  Pick prompts as in "Make it look like real use" above.
- Screenshots: prefer element screenshots of the area that changed
  (`w screenshot <file>` on the webview, or a `w run` script calling
  `locator.screenshot()`); use `-w workbench screenshot` only when the
  surrounding window matters.
- For before/after diffs take both shots the same way: same port, same mode
  (prod), same window (no resize), same locator, same data. Keep dynamic
  content (timestamps, task ids, model output) out of the shot: screenshot
  just the element that changed, or pin the text first, e.g.
  `w eval 'document.querySelectorAll("time").forEach(e => e.textContent = "12:00")'`.
  Then:
  ```bash
  node .agents/skills/ship-pr/scripts/visual-diff.mjs $EV/<name>-before.png $EV/<name>-after.png
  ```
  Check that `bbox` is where you expect the change. A diff spread over the
  whole image usually means the shots aren't comparable; retake them.
- Look at every screenshot you put in the PR (open the image) and confirm it
  shows what the caption says and passes the real-use check above.
- Put images straight into the PR body: `scripts/upload-assets.sh` prints a
  markdown image line per file; paste those.
- Prefer `check` assertions over "it looks right". Use `check --pass --note`
  only for what can't be asserted from the DOM (e.g. a screenshot you
  reviewed).

## Evidence directory

Keep everything for one run in `EV=/tmp/ship-pr/<branch>` (screenshots,
diffs, `context.md`, `pr-body.md`, command output worth quoting).
It is outside the repo, so nothing ends up in a commit by accident.
