---
name: run-skill-generator
description: |
  Create or improve a project-specific run skill that records a verified way to build, launch, drive, observe, and stop one runnable unit. Use when the user explicitly invokes /run-skill-generator, asks to save reliable run instructions, or wants a reusable driver for an app, service, CLI, TUI, desktop app, or library.
disable-model-invocation: true
user-invocable: true
---

# Generate a Project Run Skill

Create a reusable Skill under the repository-root `.pochi/skills/run-<unit-name>/`. The result must describe commands and interactions verified in the current environment, not paraphrase project documentation.

## Deliverables

Produce:

```text
.pochi/skills/run-<unit-name>/
├── SKILL.md
└── <optional driver or smoke helper>
```

Keep the driver beside `SKILL.md` when it exists only for agent operation. Put it in the project's normal `scripts/` or end-to-end directory only when the project itself should own and reuse it.

The Skill directory is for durable instructions and resources required by future runs. Never store generated screenshots, logs, command output, caches, recordings, or other validation artifacts there. During generation, write evidence to a temporary directory, inspect it, and delete it before finishing. Retain evidence only when the user explicitly requests it, and keep retained evidence outside `.pochi/skills/`. Do not add a generated artifact merely because it was useful while authoring the Skill.

Do not create a Git commit unless the user explicitly asks.

## 1. Select the unit

Identify one independently runnable application, service, command, or package. In a monorepo, list plausible units and ask the user when the target cannot be inferred safely.

Use a lowercase kebab-case name such as `run-billing-api`. Store the Skill at the repository root even when the unit lives in a subdirectory; state the unit directory explicitly in `SKILL.md`.

## 2. Reuse existing work

Inspect:

- `.pochi/skills/`
- `.agents/skills/`
- manifests and task-runner configuration
- README and contribution documentation
- CI workflows and existing smoke or end-to-end harnesses

If an existing Skill already covers the unit, improve it in place. Preserve working commands and naming; change only claims you revalidated or gaps you actually filled.

## 3. Choose a runtime handle

Read [references/driver-patterns.md](references/driver-patterns.md) and select the narrowest handle that reaches a real user-facing operation:

- CLI: direct executable invocation;
- library: public consumer import;
- server: background job plus protocol client;
- web UI: Pochi `browser` agent;
- desktop/TUI: existing automation or a small project-specific driver.

Do not build a custom driver when Pochi or the project already provides an adequate one.

## 4. Prove the path

Work from a fresh shell and the current checkout:

1. Install only required project dependencies.
2. Build the runnable unit if needed.
3. Launch it with `executeCommand`, using `background: true` for long-lived processes and retaining the returned job ID and output file.
4. Wait for an observable ready condition, using `readFile` when the output contains a ready marker or useful diagnostics, or a real health/interface check. Keep retries purposeful and bounded; do not repeatedly read unchanged or empty output.
5. Perform one representative user flow.
6. Capture output, response data, terminal state, or a screenshot in a temporary directory.
7. Inspect the captured result.
8. Stop background jobs with `killBackgroundJob`, delete temporary evidence, and clean up everything else started by the task. Retain evidence only when the user explicitly requests it.

Do not modify product source, disable security controls, bypass licensing or authentication, or mutate external systems to force a successful run. Ask before installing system packages or making persistent environment changes.

Keep notes about exact errors and fixes while iterating. Only verified fixes belong in the final Skill.

## 5. Write the Skill

Read [references/template.md](references/template.md) and create `SKILL.md`.

Requirements:

- Put trigger phrases such as "run", "start", "build", "preview", "screenshot", and the unit name in the description when applicable.
- Set paths relative to the repository root.
- Put the automated or agent path before the human-only path.
- Include a deterministic readiness check and cleanup procedure for long-lived processes.
- Include only commands run successfully in this task.
- Mark platform-specific steps and versions precisely.
- Record concrete gotchas encountered; omit generic troubleshooting.
- Reference every bundled helper by its actual path.
- Keep generated evidence and runtime output outside the Skill directory. Direct future runs to clean up temporary output unless the user asks to retain it. Bundle only durable helpers or static resources required for future runs.

Write helper code only when repeated interaction would otherwise be unreliable. Keep its interface small and observable: explicit commands, structured output, temporary artifact paths outside `.pochi/skills/`, and clean shutdown.

## 6. Validate from the document

Open a fresh shell and follow the completed `SKILL.md` without relying on unstated session knowledge. Re-run the representative flow. If any improvisation is necessary, update the Skill and repeat.

Confirm that Pochi discovers the Skill and that its description identifies the intended unit without colliding with another run skill.

## Definition of done

Finish only when:

- the real unit was launched or imported through its public boundary;
- at least one representative operation was observed;
- all documented commands were executed successfully in the current environment;
- any driver/helper was used successfully;
- evidence was inspected and deleted unless the user explicitly requested retaining it;
- started processes and sessions were cleaned up;
- the Skill directory was reviewed and contains no generated evidence or transient runtime files;
- the Skill and required durable resources are saved, with no automatic commit.

If the environment prevents reaching the runtime surface, report the blocker and do not create an unverified Skill.
