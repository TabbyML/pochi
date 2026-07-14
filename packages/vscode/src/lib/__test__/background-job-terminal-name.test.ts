import * as assert from "node:assert";
import { describe, it } from "mocha";
import { getBackgroundJobTerminalName } from "../background-job-terminal-name";

describe("getBackgroundJobTerminalName", () => {
  it("uses a concise command title", () => {
    assert.strictEqual(getBackgroundJobTerminalName("bun test"), "bun test");
  });

  it("strips leading inline environment assignments", () => {
    assert.strictEqual(
      getBackgroundJobTerminalName(
        'GEMINI_MSRL_PROJECT_ID=ollie-rl GEMINI_MSRL_BASE_URL="https://example.com" bun run dev',
      ),
      "bun run dev",
    );
  });

  it("handles quoted environment values with spaces", () => {
    assert.strictEqual(
      getBackgroundJobTerminalName('OP_NAME="projects/ollie rl/locations/us" python server.py'),
      "python server.py",
    );
  });

  it("clips long commands to the maximum terminal title length", () => {
    assert.strictEqual(
      getBackgroundJobTerminalName(
        "bun run very-long-background-command-name-that-would-overflow-terminal-tabs -- --watch --verbose",
      ),
      "bun run very-long-backg…",
    );
  });
});
