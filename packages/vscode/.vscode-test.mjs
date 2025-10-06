import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@vscode/test-cli";

// Get directory path in ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  files: "src/**/*.test.ts",
  mocha: {
    ui: "bdd",
    timeout: 10000,
    /** Set up alias path resolution during tests */
    require: ["./scripts/vscode-test-bootstrap.js"],
  },
  version: "stable",
  extensionDevelopmentPath: path.resolve(__dirname),
  installExtensions: ["ms-vscode.js-debug-nightly"],
  // Launch VS Code with the test-workspace folder open
  env: {
    POCHI_TEST: "true",
  },
  launchArgs: [path.resolve(__dirname, "test-workspace")],
});
