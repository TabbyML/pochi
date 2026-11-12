# Writing the PR

The body template is the repo's `.github/pull_request_template.md`, the same
one people get on github.com. Start from it:
`cp .github/pull_request_template.md $EV/pr-body.md`, then fill it in.

## Title

Conventional commit, checked by CI (`.github/workflows/pr-title.yml`):
`<type>(<scope>): <description>`.
- Type: from step 1 (feat, fix, docs, style, refactor, perf, test, build, ci,
  chore, revert).
- Scope: the main package without `packages/` (`vscode`, `vscode-webui`,
  `livekit`, `common`, ...). Omit it when the change spans several.
- Description: imperative, lowercase, states the user-visible effect.
  E.g. `fix(vscode-webui): return to the parent task on mouse back from a subtask`.

## Filling in the body

- Remove every `<!-- ... -->` guidance comment and every placeholder.
- Keep the template's section order. Delete sections that don't apply instead
  of writing "N/A". Summary and Test plan always stay.
- **Every claim must come from a step you actually ran.** Check boxes (`[x]`)
  only for what you did; leave out what you didn't do.
- Keep it about the change. Problems with your local environment and their
  workarounds (long paths, flaky local tooling, retries) don't belong in the
  PR; put them in the final report to the user. Mention one only if it
  limits what was verified.
- Write plainly: short sentences, concrete names (files, functions, labels),
  no marketing. Prefer bullet lists; use tables only for image grids.

Per section:

- **Summary**: `Closes #<n>` if there is an issue, otherwise
  `Requested by @<user>: <one line>` (for a screenshot or chat message, name
  who asked and where, e.g. "Requested by @alice in Slack #pochi-dev"). Then 1–3 bullets: what changed for the
  user, and why.
- **Root cause** (bug fixes): from `context.md`, the cause you confirmed, not
  the first hypothesis. Link the code.
- **Changes**: one bullet per meaningful change: `` `package`: what and why ``.
- **Assumptions**: add this section after Changes when you picked an
  interpretation of an ambiguous requirement (it's not in the template).
- **Test plan**:
  - The checks you ran, with test counts (e.g. "`bun turbo test` for
    vscode-webui: 1010 passed"). Note that CI runs the full pre-push gate.
  - New or updated tests and what they assert (for bugs: they fail without
    the fix).
  - "Real VS Code (prod webview bundle)" with each TC as
    Given → When → Then. **Only TCs you actually executed in VS Code go
    under this item.** A TC covered by unit tests, or by reasoning that the
    code path is unchanged, goes under the tests item and says so
    (e.g. "task mentions keep the bordered badge: default variant
    unchanged, `markdown` tests pass"), never as a checked VS Code TC.
- **Evidence**, by level (`references/evidence.md`):
  - L0: delete the section; the Test plan is the evidence.
  - L1: the before/after table with the image lines from `upload-assets.sh`,
    plus the `visual-diff.mjs` compare image below it. Without a "before",
    replace the table with captioned screenshots of the key states.
  - L2: the recording first, with its outcome:
    `[▶ <title>](https://jam.dev/c/...) ✅ PASS, <n>/<n> checks`.
    For bugs, also the reproduction: `[▶ Before: <title>](...) ❌ reproduces the bug`.
    Then key-state screenshots if they help.
- **Known limitations**: what is intentionally not covered, follow-ups.
  Delete if none.
- End with a footer line naming the agent and model, e.g.
  `🤖 Generated with Pi (<model>)`.
