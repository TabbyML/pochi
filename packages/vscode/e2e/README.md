# Pochi VS Code E2E tests (Playwright)

Each test launches a real VS Code (downloaded into `../.vscode-test`, shared
with the unit tests) through Playwright's `_electron`, with the local extension
loaded, a fresh user-data dir, and a fresh workspace.

```bash
# from the repo root; builds the extension first. Needs POCHI_API_KEY.
bun turbo test:integration --filter=pochi
# one file or test (from packages/vscode, after a build)
bun run test:integration -- create-task
bun run test:integration -- -g "creates a task"
```

- `fixtures.ts`: `workspace` option (`plain` | `git` | `git-worktrees` | `none`),
  `page` (the workbench window) and `pochi` (sidebar opened; model selected
  unless `workspace` is `none`).
- `lib/pochi.ts`: Pochi locators and helpers, shared with the agent UI tool
  `.agents/skills/run-vscode-extension/scripts/webview.mjs` (`pochi` in `w run`
  scripts), so a verification flow can be kept as a spec.
- `specs/<workspace type>/*.spec.ts`: pick the workspace with `test.use({ workspace: "git" })`.

Env: `VSCODE_VERSION` (default `stable`), `POCHI_E2E_MODEL` (model name to
select; default keeps the current one or picks the first).
On failure, a trace (`npx playwright show-trace <trace.zip>`) and a screenshot
are attached; on CI they are uploaded as the `playwright-report` artifact.
With `CI` set: 1 worker, 1 retry, and an HTML report in `playwright-report/`.
