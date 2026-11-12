Pochi is an project developed using following technologies:
1. always use kebab-case for filenames.
2. always use camelCase for variables, functions.
3. use PascalCase for classes, interfaces, types.

# Testing for non packages/vscode
We use vitest framework.
our test use vitest framework.
test command: `bun run test`
coverage test command: `bun run test -- --coverage`

## Testing for packages/vscode
We use mocha framework, when creating test, do not use mocks for filesystem, just use vscode.workspace.fs to create files and folders, and only use mocha primitives for testing. use sinon for mocks.

(assuming cwd is packages/vscode)
test command: `bun run test`
coverage test command: `bun run test:coverage`
e2e test command: `bun turbo test:integration --filter=pochi`, always run it with background job

When encountering issues like `TypeError: Descriptor for property readFile is non-configurable and non-writable`, please use `proxyquire` to mock the module.

### E2E Testing Guidelines
1. **Framework**: Playwright, in `packages/vscode/e2e` (see its README). Each test launches a real VS Code with the local extension, a fresh profile and a fresh workspace.
2. **Workspace**: one folder per workspace type under `e2e/specs/` (`git-workspace`, `plain-workspace`, `git-worktrees-workspace`, `no-workspace`); select it with `test.use({ workspace: "git" })`.
3. **Fixtures and helpers**: use the `page` and `pochi` fixtures from `e2e/fixtures.ts`. Pochi locators and actions live in `e2e/lib/pochi.ts` (shared with the agent tool `webview.mjs`); add new helpers there instead of in specs.
4. **WebViews**: `pochi.sidebar` and `pochi.taskTab` are frame locators into the Pochi webviews; no manual frame switching.
5. **Selector Stability**: Add/use `aria-label` or `data-testid` attributes for stable selectors. Don't use tailwind classes to locate elements.
6. **Assertions**: use web-first assertions (`await expect(locator).toBeVisible()`), not sleeps. Assert structured state, not exact model output.
7. **Test Granularity**: One behavior per test when possible.
8. **Debugging**: failures attach a Playwright trace and a screenshot (`npx playwright show-trace <trace.zip>`); CI uploads them as the `playwright-report` artifact.
9. **Test Command**: `bun turbo test:integration --filter=pochi` (needs `POCHI_API_KEY`), always run it with background job. One file: append `-- <file or -g "title">`.


# Misc
1. use `bun check` to format / linting the code, use `bun fix` to automatically apply the fix.
2. use `bun tsc` to check the types.
3. For packages/code it uses `ink` for react terminal ui.
4. Prefer `@/lib` over `../lib` for imports.
5. For global variable in typescript, prefer using PascalCase, e.g `GlobalVariableName`, instead of `GLOBAL_VARIABLE_NAME`.
6. For biome related warning / errors, prefer using `bun fix` in the root directory to fix the issues.
7. `packages/db/src/schema.d.ts` is auto generated with script 'db:genschema'. Do not modify it directly.
8. To add new vscode host method, we need register the method in 4 files
    - packages/common/src/vscode-webui-bridge/webview.ts
    - packages/common/src/vscode-webui-bridge/webview-stub.ts
    - packages/vscode/src/integrations/webview/vscode-host-impl.ts
    - packages/vscode-webui/src/lib/vscode.ts
9. Reuse UI componnent in packages/vscode-webui/src/components
10. When you need to look up information about LiveStore, always use the `docs` directory that's shipped as part of the `@livestore/livestore` package in `node_modules/@livestore/livestore/docs`.