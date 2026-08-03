# Project run skill template

Remove sections that do not apply. Replace every placeholder with verified information.

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

<State whether to use executeCommand or startBackgroundJob and how readiness is observed.>

\`\`\`bash
<verified launch command>
\`\`\`

## Drive

<Give a real CLI invocation, API request, browser-agent task, driver command, or public library example.>

Expected observation: <specific output or visible state>.

Artifacts: <screenshot/output paths, if any>.

## Stop

<Exact cleanup procedure for jobs, sessions, browser state, and temporary resources.>

## Human path

<Optional human-only command when meaningfully different.>

## Gotchas

- <specific issue observed in this environment and its verified resolution>

## Troubleshooting

- **<exact symptom>**: <verified cause and fix>
```

Do not include a section containing guesses, copied commands that were not run, or generic advice.
