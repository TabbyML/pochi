# Project run skill template

Remove sections that do not apply. Replace every placeholder with verified information. The Skill directory should contain only durable instructions, required helpers, and required static resources. Runtime evidence must use a temporary location outside `.pochi/skills/` and be deleted after inspection unless the user explicitly requests retaining it.

```markdown
---
name: run-<unit-name>
description: |
  Build, launch, and interact with <unit>. Use when asked to run, start, preview, build, or exercise <unit>, or capture its runtime output or UI.
---

# Run <unit>

<One sentence naming the unit directory and runtime handle.>

All paths are relative to the repository root.

## Prerequisites

- <runtime/tool and verified version or platform requirement>

## Setup

\`\`\`bash
<verified one-time project setup>
\`\`\`

## Build

\`\`\`bash
<verified build command, or omit this section>
\`\`\`

## Launch

<State how to use executeCommand, including background: true for a long-lived process, and how its output file or public interface establishes readiness. Give readiness checks a clear deadline and avoid repeatedly reading unchanged or empty output.>

\`\`\`bash
<verified launch command>
\`\`\`

## Drive

<Give a real CLI invocation, API request, browser-agent task, driver command, or public library example.>

Expected observation: <specific output or visible state>.

Temporary evidence: <screenshot/output path outside `.pochi/skills/`, if any; delete it after inspection unless the user requests retaining it>.

## Stop

<Exact cleanup procedure for jobs, sessions, browser state, temporary evidence, and other temporary resources.>

## Human path

<Optional human-only command when meaningfully different.>

## Gotchas

- <specific issue observed in this environment and its verified resolution>

## Troubleshooting

- **<exact symptom>**: <verified cause and fix>
```

Do not include a section containing guesses, copied commands that were not run, or generic advice.
