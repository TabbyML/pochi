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
e2e test command: `bun run e2e`, always run it with background job

When encountering issues like `TypeError: Descriptor for property readFile is non-configurable and non-writable`, please use `proxyquire` to mock the module.

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