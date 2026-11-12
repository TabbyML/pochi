import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@vscode/test-cli";

// Get directory path in ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// VS Code puts its IPC socket in the user data dir, and Unix socket paths are
// limited to ~103 characters. The default (.vscode-test/user-data inside this
// package) exceeds that in deeply nested checkouts such as git worktrees
// (`listen EINVAL`). Use a short per-checkout dir under the temp dir instead.
const userDataDir = path.join(
  os.tmpdir(),
  `pochi-vt-${createHash("sha1").update(__dirname).digest("hex").slice(0, 8)}`,
);

export default defineConfig({
  tests: [
    {
      files: "src/**/*.test.ts",
      mocha: {
        ui: "bdd",
        timeout: 10000,
        /** Set up alias path resolution during tests */
        require: ["./scripts/vscode-test-bootstrap.js"],
      },
      version: "stable",
      extensionDevelopmentPath: path.resolve(__dirname),
      // test-cli only honors --user-data-dir in the per-test launchArgs.
      launchArgs: [`--user-data-dir=${userDataDir}`],
      installExtensions: ["ms-vscode.js-debug-nightly"],
    },
  ],
  coverage: {
    reporter: ["html", "json"],
    includeAll: true,
  },
  // Launch VS Code with the test-workspace folder open
  env: {
    POCHI_TEST: "true",
  },
  launchArgs: [path.resolve(__dirname, "test-workspace")],
});
