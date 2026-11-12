---
name: ship-pr
description: End-to-end delivery of a change to the Pochi repo, from a requirement (GitHub issue, bug report, or request) to an opened pull request with verification evidence. Plans the change, reproduces bugs first, implements it with tests, verifies it in a real VS Code running the local extension (clicks, assertions, screenshots, visual diffs, Jam recordings as needed), then opens the PR with a standard body (what, why, root cause, test plan, evidence). Use when the user asks to take an issue or requirement all the way to a PR ("ship this", "fix #123 and open a PR", "/ship-pr").
---

# Ship a PR: requirement → verified pull request

The user has already decided this change should go through this flow. Don't
re-judge whether it's feasible or worth doing, and don't stop to ask for
confirmation between steps. Run to an opened PR on your own. This flow may run
unattended (Pochi, Pi, Codex, ...), so:

- **Only stop for hard blockers**: missing credentials you can't fix (`gh` not
  logged in, can't push), a build or environment that won't start after
  reasonable debugging, or a requirement so contradictory that any
  implementation would be a guess at a different feature. Then report what
  you tried and what's needed.
- **Ambiguity is not a blocker.** Pick the most reasonable interpretation
  consistent with the codebase, note it under "Assumptions" in the PR, and go on.
- **Never block on a long-running process.** Start servers, VS Code, and long
  commands detached (`run-vscode-extension`'s `env.sh` does this for the VS
  Code environment).
  For anything else that may take minutes, use
  `nohup <cmd> > $EV/<name>.log 2>&1 &` and poll the log. Don't rely on your
  harness having background jobs.
- **Bounded retries.** At most 3 attempts at the same failure (a test, a build,
  a CI job) before changing approach. If it still fails, ship what works only
  if the failure is unrelated and documented. Otherwise stop and report.

Paths below are relative to the repo root. This skill reuses two repo skills.
Read their SKILL.md when you reach the step that needs them:
- `.agents/skills/run-vscode-extension/SKILL.md`: start/stop VS Code (`env.sh`) and drive its UI (`webview.mjs`)
- `.agents/skills/record-vscode-extension/SKILL.md`: Jam recordings with checks (`record.mjs`)

Supporting files in this skill:
- `references/evidence.md`: evidence levels, test-case format, capture rules. **Read it in step 1.**
- `references/writing-the-pr.md`: PR title and how to fill in the body. **Read it in step 6.**
- `.github/pull_request_template.md`: the repo's PR body template (shared with humans).
- `scripts/worktree.sh`: create an initialized worktree, mark in-place branches, prune merged/closed ones.
- `scripts/visual-diff.mjs`: before/after pixel diff with a side-by-side compare image.
- `scripts/upload-assets.sh`: turns image files into markdown image lines for the PR body.

```bash
w() { node .agents/skills/run-vscode-extension/scripts/webview.mjs --port $PORT "$@"; }
r() { node .agents/skills/record-vscode-extension/scripts/record.mjs --port $PORT "$@"; }
E=.agents/skills/run-vscode-extension/scripts/env.sh
S=.agents/skills/ship-pr/scripts
```

## 1. Intake

1. Get the requirement. For an issue: `gh issue view <n> --comments`. Collect
   linked issues/PRs and any TC IDs (e.g. "TC-23" from a testing doc).
2. Classify:
   - **type**: `fix` (bug) | `feat` | `refactor` | `perf` | `docs` | `chore` | ... (becomes the PR title type)
   - **evidence level**: L0 / L1 / L2 per `references/evidence.md`
3. Set up the branch. Name: `<type>/<short-slug>` (add the issue number if
   there is one). First `git fetch origin main` and clean up after earlier
   runs: `$S/worktree.sh prune` removes ship-pr branches and worktrees whose
   PR is merged or closed (it never deletes anything with unsaved or
   unpushed work, and reports what it kept). Then decide where to work:
   - **In place (default).** If `git status --porcelain --untracked-files=no`
     is empty (untracked files are fine) and the current branch has no
     unpushed commits, note the current branch (`ORIG=$(git branch --show-current)`),
     then `git switch -c <branch> origin/main` and `$S/worktree.sh mark <branch>`.
     No new install or paths. Run `bun install` only if `bun.lock` changed.
   - **Worktree** only if the checkout has tracked changes or unpushed work,
     or the user asked for isolation (e.g. parallel runs):
     `WT=$($S/worktree.sh create <branch> | tail -1)`, then work in `$WT`.
     It goes to `<main checkout>.worktree/<branch>` (next to Pochi's own
     worktrees, without Pochi's metadata, so Pochi doesn't list it) and is
     initialized like a Pochi worktree: `.worktreeinclude` files such as
     `packages/vscode/.env` are copied and `.pochi/init.sh` (`bun install`)
     runs. Takes ~10 s.
   - Don't stash or commit the user's unrelated changes to make the checkout
     clean; use a worktree instead.
4. `EV=/tmp/ship-pr/<branch>`, `mkdir -p $EV`. Pick a free CDP port:
   `PORT=9233`, or the next free one if it's taken (`lsof -iTCP:$PORT -sTCP:LISTEN`).
5. Start `$EV/context.md` with the requirement (quoted or summarized with a
   link), type, level, and branch. You'll add to it as you go; it's the source
   for the PR body.

## 2. Understand and plan

1. Find the relevant code: search, read callers, read existing tests next to it.
2. Write the plan into `context.md`: the approach, files to change, risks.
   For a bug, write your root-cause hypothesis.
3. If the change has user-checkable behavior (most L1/L2), write the test
   cases now (format in `references/evidence.md`). They drive the verification,
   the recording's checks, and the PR's test plan. For L0, the unit tests you
   plan to write are the test cases.

## 3. Reproduce (bugs only) / capture the baseline

Do this **before changing any code**, so the build still has the old behavior.

- **Bug, L0**: write the test that exposes it and watch it fail. Keep it.
- **Bug, L1/L2**: `$E up --port $PORT`, then drive the UI to the broken
  state. For L2, record it (`r start "Before: ..."`, then steps and `check`s
  that show the wrong behavior, then `r stop --verdict fail`). For L1, take the
  screenshots `$EV/<name>-before.png`.
- **Non-bug L1 change to an existing view**: take the `-before.png` screenshots
  the same way, for the visual diff later.
- Otherwise skip this step.

If a bug doesn't reproduce: check the reporter's version and setup, try the
obvious variations, and read the logs (`w logs`, Pochi.log). If it still
doesn't reproduce, keep going on the code-based root cause and say so in the PR.
Update the root cause in `context.md` with what you actually found.

## 4. Implement

- Fix the root cause, not the symptom. Keep the diff focused on the
  requirement; no drive-by refactors.
- Follow the repo conventions: biome, `rules/*.yaml` (ast-grep), i18n for new
  UI strings in every locale (`bun check:i18n`), and an `aria-label` on new
  interactive elements (it also makes them drivable by `webview.mjs`).
- Add or update unit tests (vitest in `vscode-webui`/`livekit`/`common`,
  `vscode-test` in `packages/vscode`). Tests should assert behavior and, for
  bugs, fail without the fix.
- Add an integration test only when the behavior is a core flow that should
  stay guarded and unit tests can't reach it. Write new ones as Playwright
  specs in `packages/vscode/e2e/specs/<workspace type>/` (`git-workspace`,
  ...; pick the workspace with `test.use({ workspace: "git" })`), using the
  `pochi` fixture from `e2e/fixtures.ts`. A `w run` flow that uses `pochi`
  ports almost unchanged. Run one with
  `bun turbo test:e2e --filter=pochi -- <file or -g "title">` (needs
  `POCHI_API_KEY`, e.g. from `packages/vscode/.env`). The older WebdriverIO
  specs in `packages/vscode/tests/specs/` are being migrated (#2068); edit
  them only to keep them passing.
- Fast loop while iterating, per touched package:
  `bun run test` (or a single file), `bun tsc`, `bun check` from the root.

## 5. Verify in a real VS Code (L1/L2)

1. `$E up --port $PORT` (or `$E reload --port $PORT` if it's
   already up; this rebuilds the extension and the prod webview, then reloads
   the window). Use `--dev` only for quick UI iteration with Vite HMR; capture
   the final evidence in prod mode.
2. Walk every TC with `w` and assert the results (`w wait`, `w count`,
   `w text`). Fix and repeat until all pass.
3. Capture the final evidence per level (details in `references/evidence.md`):
   - **L1**: `$EV/<name>-after.png`, plus
     `node $S/visual-diff.mjs $EV/<name>-before.png $EV/<name>-after.png`
     when there's a before. Open the images and check them.
   - **L2**: one clean Jam run of the TCs: `r start "<TC/feature title>"`, a
     `r mark` per step, a `r check` per expected result. Write
     `$EV/jam-summary.md` (bullets: what is being shown, the build and
     mode, the TCs it covers), then `r stop --summary-file $EV/jam-summary.md`. For bugs, link it to the
     reproduction Jam (`--mark-related ... --type fixes`).
   - If the Jam CLI isn't installed or authenticated, don't block: capture a
     screenshot per step instead and note in the PR that no recording was made.
4. Run the tests that cover nearby features too, so you know nothing else broke.
5. Add the TC results and evidence paths/links to `context.md`.
6. `$E down --port $PORT` when you're done with the UI.

## 6. Open the PR

1. Commit the work (conventional message, same type/scope as the PR title).
2. Local checks, scoped to what changed. CI's `pre-push` job runs the full
   gate (the same as the husky hook) on the PR, so don't run the whole thing
   locally:
   ```bash
   bun fix && git diff --exit-code          # formatting/lint fixes: commit them if any
   bun check:ast-grep
   bun turbo tsc --filter='...[origin/main]'    # changed packages and their dependents
   bun turbo test --filter='...[origin/main]'
   ```
   Also run `bun check:i18n` if locale files or UI strings changed, and
   `bun dep-check` / `bun gen:config-schema` (then `git diff --exit-code`) if
   dependencies or the config schema changed. If a step takes more than a
   minute or two, run it detached with a log.
3. Push with `git push --no-verify -u origin <branch>`. The hook would re-run
   the full gate locally; CI runs it instead.
4. Images for the PR body: `$S/upload-assets.sh <the PNGs the PR shows>`. It
   prints markdown image lines to paste into the body. (It stores them in
   your single "pochi PR assets" gist, which it creates on first use.)
5. `cp .github/pull_request_template.md $EV/pr-body.md` and fill it in from
   `context.md`, following `references/writing-the-pr.md`.
   Every claim in it must be backed by a step you actually ran.
6. `gh pr create --base main --title "<type>(<scope>): <description>" --body-file $EV/pr-body.md`.
   Open it ready for review, not as a draft. If there's an issue, write
   `Closes #<n>` in the body.
7. Link Jams to the PR: `jam update jam <id> --resource <pr-url> --label PR`.
8. Tell the user the PR link right away (one line), before watching CI.

## 7. After the PR

1. Watch CI: `gh pr checks <n> --watch --interval 20` returns as soon as all
   checks finish (wait ~10 s after creating the PR so the checks exist). No
   fixed `sleep`s. On failure, read the logs
   (`gh run view <run-id> --log-failed`), fix, push, and update the PR body if
   the change affects the test plan or evidence. A failure that's clearly
   unrelated or flaky: re-run once (`gh run rerun <run-id> --failed`), then note it.
2. Clean up: `$E down --port $PORT` and stop anything else you started.
   Leave the branch and worktree in place, since follow-up fixes to the PR
   reuse them. `worktree.sh prune` removes them after the PR is merged or
   closed (the next run does it in step 1). For an in-place run, switch the
   checkout back: `git switch $ORIG`.
3. Final report to the user, short:
   - PR link and title; type and evidence level
   - what changed and why (2–3 bullets)
   - evidence: Jam links with verdicts, key screenshots, test counts
   - CI status, assumptions made, anything left open
   - environment problems you hit and how you worked around them (these go
     here, not in the PR body)

## Updating the PR later

Work on the PR's branch: if it has a worktree (`git worktree list`), work
there; otherwise switch to the branch in place (same rules as step 1). For
new commits that change behavior, re-run the affected TCs, re-record or
re-shoot the affected evidence, upload with `upload-assets.sh`,
and update the body:
`gh pr view <n> --json body -q .body > $EV/pr-body.md`, edit it, then
`gh pr edit <n> --body-file $EV/pr-body.md`.
