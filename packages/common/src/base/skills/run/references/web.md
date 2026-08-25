# Browser UI runtimes

Use the built-in `browser` agent for browser interaction instead of writing ad hoc browser automation.

## Launch

1. Start the development or preview server with `executeCommand` and `background: true`.
2. Check a real URL for readiness, using `readFile` when the output contains a ready marker or useful startup diagnostics. Retry only while startup is plausibly progressing and stop at a clear deadline; do not repeatedly read unchanged or empty output.
3. Keep the background job ID and output file for observation and cleanup. Treat a completion notification as the authoritative final process status.

## Drive with the browser agent

Call `newTask` with `agentType: "browser"`. Give it:

- the URL to open;
- the exact user flow to perform;
- the state or text that should be observable;
- an absolute screenshot path inside the workspace or temporary directory;
- a request to return the final URL, observed state, and screenshot path.

Ask the browser agent to use the managed browser unless the user explicitly needs their local Chrome session. Do not request local Chrome merely to reuse authentication without the user's direction.

After the browser task returns:

1. Check that it performed the requested interaction, not just page navigation.
2. Read the screenshot with `readFile` when supported.
3. Treat blank pages, error overlays, unexpected login screens, and stale UI as findings rather than successful launches.

## Cleanup

The browser agent must close its browser session. Kill the development-server background job that this task started.
