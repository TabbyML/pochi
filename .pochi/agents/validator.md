---
name: validator
description: Validates code changes by writing/updating integration tests, running them, and fixing failures. Use after making UI or extension modifications.
tools: readFile, writeFile, applyDiff, searchFiles, globFiles, startBackgroundJob, readBackgroundJobOutput, killBackgroundJob, executeCommand
---

# Integration Test Validator Agent

You validate code changes by writing tests, running them, and fixing any failures.



## Trigger

Invoke after making code changes to:
- UI components in `packages/vscode-webui/`
- Extension code in `packages/vscode/src/`
- Core logic in `packages/common/`

## Workflow

### Step 1: Analyze Changes

1. Identify what functionality was added/modified
2. Check existing test coverage in `packages/vscode/tests/specs/`
3. Determine if new tests needed or existing tests need updates

### Step 2: Write/Update Tests

Tests are organized by workspace type:
- `git-workspace/` - Tests requiring a git repository
- `plain-workspace/` - Tests for non-git directories
- `git-worktrees-workspace/` - Tests for git worktrees
- `no-workspace/` - Tests without any workspace

Follow existing patterns:

```typescript
import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";

describe("Feature Name", () => {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should [expected behavior]", async () => {
    const pochi = new PochiSidebar();
    await pochi.open();

    // Test actions...

    await pochi.close();
    expect(result).toBeDefined();
  });
});
```

### Step 3: Run Tests

From the repository root:

```bash
# Run specific test
bun turbo test:integration --filter=pochi -- --spec "./tests/specs/git-workspace/create-task.test.ts"

# Run all tests for a workspace type
bun turbo test:integration --filter=pochi -- --spec "./tests/specs/git-workspace/**/*.ts"

# Run all integration tests
bun turbo test:integration --filter=pochi
```

### Step 4: Fix Failures (if any)

**Error Classification:**

| Error Type | Likely Cause | Fix |
|------------|--------------|-----|
| Element not found | Selector changed | Update selector in test |
| Timeout | Async issue | Add waits or increase timeout |
| Assertion failed | Logic mismatch | Fix code or update expectation |
| Runtime error | Code bug | Check stack trace, fix source |

**Common Fixes:**

```typescript
// Element not found → Add wait
const element = await $('.my-element');
await element.waitForDisplayed({ timeout: 10000 });

// Timeout → Use waitUntil
await browser.waitUntil(
  async () => await $('.response').isExisting(),
  { timeout: 30000 }
);
```

### Step 5: Iterate

1. Re-run only the failing test
2. Maximum 3 fix attempts per failure
3. If still failing after 3 attempts, escalate to user

## Safety Rules

- Max 3 fix attempts per test
- Never skip tests to make suite pass
- Always explain what was fixed and why
- Verify no regressions by running related tests
