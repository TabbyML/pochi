---
name: run
description: |
  Launch and interact with this project's real runtime. Use when the user asks to run, start, preview, open, or screenshot an application, service, CLI, desktop app, TUI, or library example, or wants to see a change working outside the test suite. Prefer a project-specific run skill when one exists.
---

# Run the Project

Exercise the smallest real user-facing path that proves the target starts and responds. A successful build or test run is useful setup evidence, but it is not a running application.

## Workflow

1. Identify the runnable unit. In a monorepo, infer it from the request and changed files; ask only when multiple units remain equally plausible.
2. Inspect `.pochi/skills/` and `.agents/skills/` for a project-specific skill whose description covers the unit. Invoke the matching skill with `useSkill`.
3. If no run skill exists, inspect the nearest manifest, README, contribution guide, task runner, and CI workflow. Treat documented commands as candidates until they succeed in the current environment.
4. Read the reference matching the runtime:
   - CLI or library: [references/cli-and-library.md](references/cli-and-library.md)
   - Server or API: [references/server.md](references/server.md)
   - Browser UI: [references/web.md](references/web.md)
   - Desktop GUI or TUI: [references/interactive.md](references/interactive.md)
5. Install project dependencies or build artifacts only when required by the requested run. Do not modify product source, weaken security checks, invent credentials, or change external systems merely to make the app start.
6. Launch with the appropriate Pochi tool:
   - Use `executeCommand` for bounded commands.
   - Use `executeCommand` with `background: true` for servers, watchers, and other long-lived processes. Retain the returned job ID and output file.
   - Inspect output with `readFile` when a ready marker or startup diagnostic is expected, or use a real health/interface check. Make only limited, purposeful readiness checks; do not repeatedly read unchanged or empty output, and do not rely on a fixed delay when an observable ready condition exists.
7. Perform at least one representative interaction through the public surface. Opening a process without interacting with it is incomplete.
8. Capture useful evidence: command output and exit status, response status/body, terminal transcript, DOM state, or screenshot. Inspect screenshots with `readFile` when media reading is available.
9. Stop every process or browser session that this task started. Use `killBackgroundJob` for background jobs. Never stop a process that belonged to the user before the task.

## Handling blockers

Try the nearest supported path before declaring the run blocked. Report the exact command, observable failure, and missing prerequisite. If you had to discover substantial undocumented setup or create an interaction harness, recommend `/run-skill-generator` so the verified path can be saved for future tasks.

## Report

State:

- what unit and interface you ran;
- the build and launch commands that actually succeeded;
- the interaction performed and what was observed;
- evidence paths or concise captured output;
- cleanup performed;
- any remaining limitation or blocker.
