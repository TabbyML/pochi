# Verify a server or API

Start the service with `startBackgroundJob` or a project run skill. Wait for a real readiness signal, then call the route or protocol path affected by the change.

Capture:

- request method, URL, and relevant input;
- response status, headers, and body;
- related server output;
- the background job ID used for cleanup.

Probe an adjacent case that the diff makes relevant: wrong method, malformed body, missing field, repeated request, auth boundary, rate limit, or another nearby error response.

Use local fixtures and safe endpoints. Do not mutate shared databases or external services without explicit authorization. Always stop the service started for verification.
