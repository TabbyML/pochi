<!--
Title: <type>(<scope>): <description>, checked by CI.
Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
Scope: the main package (vscode, vscode-webui, livekit, common, ...); omit it if several.
Example: fix(vscode-webui): return to the parent task on mouse back from a subtask

Delete sections that don't apply (and these comments). Keep Summary and Test plan.
-->

## Summary

Closes #

- What changed, from the user's point of view.
- Why: the problem or need this addresses.

## Root cause

<!-- Bug fixes: what was actually wrong in the code and why it caused the symptom. If it couldn't be reproduced, say so and what the fix is based on. -->

## Changes

<!-- One bullet per meaningful change (not per file): `package`: what changed and why. -->

-

## Test plan

<!-- What you ran and what you checked. Test cases as Given → When → Then. -->

- [ ] `bun check`, `bun tsc`, `bun run test` in
- [ ] New/updated tests:
- [ ] Real VS Code:
  - [ ] TC-1:

## Evidence

<!--
Proof the change works, matched to the change:
- Logic only: the test results above are enough; delete this section.
- UI change: screenshots, before/after for changes to an existing view.
- Interaction or flow: a recording (e.g. Jam) with its verdict; for bugs also the "before" reproduction.
-->

| Before | After |
| --- | --- |
|  |  |

## Known limitations

<!-- Optional: what is intentionally not covered, follow-ups. -->
