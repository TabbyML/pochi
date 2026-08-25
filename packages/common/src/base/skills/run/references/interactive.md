# Desktop GUI and TUI runtimes

Interactive applications need a programmatic handle. Prefer an existing project driver over inventing one during an ordinary `/run`.

## Desktop GUI

Look for:

- a project-specific `run-*` skill;
- Playwright, WebDriver, Appium, or Electron automation;
- an existing development or smoke-test driver;
- a browser-accessible version of the UI.

Launch and drive the app with the existing harness. Capture a screenshot and inspect it. A process staying alive or a window being created is not sufficient evidence.

If no harness exists and the application cannot be controlled with available Pochi tools, report the limitation and recommend `/run-skill-generator`. Do not add a permanent driver unless the user asked to create or improve the run skill.

## TUI

Prefer a project-provided driver or non-interactive command mode. Otherwise:

1. Check whether `tmux` is already available.
2. Start an isolated, uniquely named session.
3. Wait for a visible ready marker.
4. Send the smallest representative key sequence.
5. Capture the pane as evidence.
6. terminate only the session created for this task.

Do not install `tmux` or another system package without permission. Do not reuse or kill the user's existing sessions.

## Cross-platform behavior

Use commands appropriate to the current host. Do not assume Linux, Xvfb, GNU `timeout`, or a particular shell. Record platform-specific prerequisites only after confirming them in the current environment.
