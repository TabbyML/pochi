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
doc, "TC-23"), reuse those IDs.

## Capturing in VS Code

Environment: `run-vscode-extension`'s `env.sh up` (prod webview bundle by
default). Drive the UI with `run-vscode-extension`'s `webview.mjs` (`w`), record with
`record-vscode-extension`'s `record.mjs` (`r`). Read both skills' SKILL.md
first.

- Real model calls are fine. The local Pochi account is already signed in.
  Keep prompts short and deterministic ("Reply with exactly PONG") and give
  `wait-text` a generous `--timeout`.
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
  shows what the caption says.
- Put images straight into the PR body: `scripts/upload-assets.sh` prints a
  markdown image line per file; paste those.
- Prefer `check` assertions over "it looks right". Use `check --pass --note`
  only for what can't be asserted from the DOM (e.g. a screenshot you
  reviewed).

## Evidence directory

Keep everything for one run in `EV=/tmp/ship-pr/<branch>` (screenshots,
diffs, `context.md`, `pr-body.md`, command output worth quoting).
It is outside the repo, so nothing ends up in a commit by accident.
