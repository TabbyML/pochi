---
name: verify
description: |
  Verify that a code change works through observable runtime behavior. Use when the user explicitly invokes /verify to exercise the affected CLI, service, web UI, desktop UI, TUI, library API, or agent workflow end to end and produce an evidence-based verdict. Skip changes with no runtime surface.
disable-model-invocation: true
user-invocable: true
---

# Verify Runtime Behavior

Prove or disprove the change at the interface where a user or integration encounters it. Tests, type checks, and code inspection can support setup, but they cannot replace runtime observation.

## 1. Establish the claim and scope

Read the user's claim and inspect the complete change:

- Use `git status`, `git diff`, and `git log` for local work.
- Use the pull-request diff when the request identifies a PR.
- Include committed and uncommitted changes that belong to the requested scope.
- Treat a mismatch between the stated claim and the diff as a finding.

If there is no diff and the user did not name a behavior to verify, report `BLOCKED` with the missing scope.

## 2. Find the observable surface

Map changed code to the nearest public interface:

- CLI or library: [references/cli-and-library.md](references/cli-and-library.md)
- Server or API: [references/server.md](references/server.md)
- Browser, desktop, or TUI: [references/interactive.md](references/interactive.md)
- Prompt, agent, or Skill behavior: [references/agent-workflows.md](references/agent-workflows.md)

For documentation-only, tests-only, comment-only, or erased type-only changes with no emitted behavior, report `SKIP` and explain why. Do not manufacture a runtime check.

## 3. Acquire a verified launch path

Inspect `.pochi/skills/` and `.agents/skills/` for a matching project-specific `run-*` or verifier skill. Invoke it with `useSkill` when registered. Otherwise use the built-in `run` skill to establish a runtime handle.

If startup requires undocumented work, keep verification focused on the current change. Do not silently rewrite project run instructions. Recommend `/run-skill-generator` when the launch path should be captured for future work.

## 4. Plan observations

Write a compact plan containing:

1. the claim to observe;
2. the public interface that reaches the changed code;
3. one representative success path;
4. at least one relevant adjacent or failure-path probe;
5. the evidence each step will capture.

If every planned step is a build, test, or type check, the plan does not verify runtime behavior. Find the real interface or report `BLOCKED`.

## 5. Run and probe

Build only what is necessary, launch the application, and drive the changed path.

- Use temporary data, local fixtures, dry-run modes, or disposable accounts.
- Never publish, send, delete, charge, deploy, or mutate external systems without explicit authorization.
- Isolate ports, temporary directories, browser sessions, and terminal sessions from user-owned state.
- Capture raw observations before interpreting them.
- Inspect screenshots and generated files; their existence alone is not success.

After the main path, try one probe suggested by the change: malformed input, missing value, repeat execution, conflicting option, stale state, cancellation, or a nearby error branch. Choose a probe with a plausible relationship to the diff rather than following a generic checklist.

## 6. Clean up

Close browser sessions and stop only the background jobs, temporary services, and terminal sessions started by this verification. Preserve evidence files long enough for the user to inspect them.

## 7. Report

Read [references/report.md](references/report.md) and use its verdict definitions and output shape. Base the verdict on runtime evidence:

- `PASS`: the intended behavior and selected probe were observed successfully.
- `FAIL`: the running system contradicted the claim or exposed a material regression.
- `BLOCKED`: the relevant surface could not be reached or observed.
- `SKIP`: the change has no runtime behavior to exercise.

Do not convert a partial or ambiguous result into `PASS`.
