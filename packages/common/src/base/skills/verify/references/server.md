# Verify a server or API

Reuse the setup and launch instructions from a project run skill, or start the service with `executeCommand` and `background: true`. Retain the returned job ID and output file, and keep the service running until all verification probes finish. Check a real readiness signal before calling the affected route or protocol path. Use `readFile` when output contains a ready marker or useful diagnostics; keep readiness retries purposeful and bounded, and do not repeatedly read unchanged or empty output. A completion notification is the authoritative final status if the process exits.

Capture:

- request method, URL, and relevant input;
- response status, headers, and body;
- related server output;
- the background job ID used with `killBackgroundJob` for cleanup.

Probe an adjacent case that the diff makes relevant: wrong method, malformed body, missing field, repeated request, auth boundary, rate limit, or another nearby error response.

Use local fixtures and safe endpoints. Do not mutate shared databases or external services without explicit authorization. Always stop the service started for verification.
