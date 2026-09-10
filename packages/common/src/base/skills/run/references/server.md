# Server and API runtimes

Use Pochi background jobs for lifecycle management.

## Launch

1. Build or install dependencies with `executeCommand`.
2. Start the server with `executeCommand`, setting `background: true` and `cwd` to the runnable unit.
3. Retain the returned background job ID and output file.
4. When the application exposes a ready marker, inspect the output file with `readFile`; otherwise check a real health endpoint. Retry only when startup is still plausibly progressing, use a clear deadline, and do not repeatedly read unchanged or empty output. A completion notification is authoritative if the process exits before becoming ready.

Choose an unused or configurable port when possible. Do not kill an existing process merely because it occupies the default port.

## Drive

Send a request that reaches the relevant public route or protocol. Capture:

- status code;
- relevant response headers;
- response body or protocol output;
- corresponding server log lines when they explain the behavior.

A health check proves readiness, not the feature. Exercise at least one representative application endpoint after the health check.

## Cleanup

Call `killBackgroundJob` for the job you started, even after a failed request. If the process exited itself, read the remaining output and report its final status.

## Common blockers

- Missing credentials: ask for a safe development credential or report the gated path; never fabricate one.
- Database or queue unavailable: use an existing documented local fixture. Do not provision or modify external infrastructure without authorization.
- Port conflict: select another supported port and record the override.
- Readiness timeout: include the last relevant process output rather than reporting only "server failed."
