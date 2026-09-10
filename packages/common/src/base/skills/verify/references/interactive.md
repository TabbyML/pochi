# Verify an interactive UI

## Browser UI

Reuse the setup and launch instructions from a project run skill, or start the app with `executeCommand` and `background: true`, retaining its job ID and output file. Keep the app running while `newTask` with `agentType: "browser"` performs the verification flow, inspect useful startup output with `readFile` when needed, and stop the app with `killBackgroundJob` after all probes finish.

Tell the browser agent:

- which URL and flow reach the changed behavior;
- the expected observable state;
- one related failure or edge-path interaction;
- where to save screenshots;
- to return the final URL, visible text/state, and artifact paths.

Inspect the returned screenshot with `readFile` when supported. A successful click call is not evidence if the resulting UI is blank, stale, or wrong.

## Desktop GUI

Use the project's automation driver. Capture the window after the changed state appears. If no available tool can interact with the application, report `BLOCKED`; do not claim success from process output alone.

## TUI

Use an existing driver or an isolated `tmux` session when available. Send input that reaches the change and capture the pane before and after. Do not reuse the user's terminal sessions.
