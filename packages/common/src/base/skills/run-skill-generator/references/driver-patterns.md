# Driver patterns

Choose the simplest durable handle for the unit.

## CLI

Use the real executable. Document representative arguments, stdin behavior, expected exit status, and meaningful output. Add a smoke helper only when setup or result inspection requires several repeatable steps.

## Library

Use a small consumer example that imports the package by its public name. Keep temporary examples outside source directories unless the project intentionally maintains an examples folder.

## Server or API

Use `executeCommand` with `background: true` for launch, a real readiness endpoint or log marker, and the native protocol client such as `curl`. Document how to retain the returned job ID and output file, inspect useful output with `readFile`, bound readiness retries with a clear deadline, and stop the job with `killBackgroundJob`. Do not repeatedly read unchanged or empty output. Add a script when requests, fixture setup, or cleanup form a repeatable sequence.

## Web UI

Use Pochi's `browser` agent. The run skill should describe:

- how to launch the web server;
- the URL and readiness check;
- the browser flow to request through `newTask`;
- the expected visible state;
- a temporary screenshot location outside `.pochi/skills/`;
- screenshot cleanup after inspection unless the user requests retaining it;
- server and browser cleanup.

Do not add Playwright boilerplate solely to duplicate the browser agent. Reuse an existing project Playwright suite when it contains application-specific setup the browser agent needs.

## Desktop GUI

Prefer existing Playwright, WebDriver, Appium, or project automation. If none exists, a driver may be appropriate only when it can launch the development build, expose a small set of stable interaction commands, capture screenshots, and close cleanly.

Keep platform-specific launch logic explicit. Do not assume Xvfb or Linux when authoring on another host.

## TUI

Prefer an existing driver. Otherwise use an isolated terminal multiplexer only when already available. Give sessions unique names, wait for ready text, expose the minimum key sequences needed for a representative flow, capture the pane, and always terminate the created session.
