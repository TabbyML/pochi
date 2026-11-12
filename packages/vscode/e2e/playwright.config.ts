import { defineConfig } from "@playwright/test";

const isCI = !!process.env.CI;

// Each test launches its own VS Code (see fixtures.ts). Build the extension
// first: `bun turbo test:e2e --filter=pochi` does it.
export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  outputDir: "./test-results",
  // VS Code start-up plus real model calls.
  timeout: 3 * 60_000,
  expect: { timeout: 30_000 },
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Every worker runs a full VS Code; keep memory in check on CI runners.
  workers: isCI ? 1 : 2,
  reporter: isCI
    ? [
        ["list"],
        ["html", { outputFolder: "./playwright-report", open: "never" }],
      ]
    : [["list"]],
  use: {
    actionTimeout: 30_000,
  },
});
