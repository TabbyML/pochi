import * as assert from "node:assert";
import { describe, it } from "mocha";
import {
  buildPtyEnv,
  buildPtyShellCommand,
  toNonInteractivePtyCommand,
} from "../execute-command-with-pty";

describe("execute-command-with-pty", () => {
  it("should wrap command to detach stdin on posix", () => {
    const wrapped = toNonInteractivePtyCommand("git pull", "darwin");
    assert.ok(wrapped.includes("git pull"));
    assert.ok(wrapped.includes("</dev/null"));
  });

  it("should not wrap command on windows", () => {
    const wrapped = toNonInteractivePtyCommand("git pull", "win32");
    assert.strictEqual(wrapped, "git pull");
  });

  it("should build shell command with stdin-detached wrapper on posix", () => {
    const shellCommand = buildPtyShellCommand("echo hello", "darwin");
    assert.ok(shellCommand, "Expected a shell command to be built");
    assert.ok(
      shellCommand?.args.at(-1)?.includes("</dev/null"),
      "Expected wrapped command to detach stdin",
    );
  });

  it("should build shell command without stdin-detached wrapper on windows", () => {
    const shellCommand = buildPtyShellCommand("echo hello", "win32");
    assert.ok(shellCommand, "Expected a shell command to be built");
    assert.ok(
      !shellCommand?.args.at(-1)?.includes("</dev/null"),
      "Expected windows command to skip the posix-only stdin wrapper",
    );
  });

  it("should enforce non-interactive terminal env precedence", () => {
    const env = buildPtyEnv({
      GIT_TERMINAL_PROMPT: "1",
      GCM_INTERACTIVE: "always",
    });

    assert.strictEqual(env.GIT_TERMINAL_PROMPT, "0");
    assert.strictEqual(env.GCM_INTERACTIVE, "never");
    assert.strictEqual(env.GIT_EDITOR, "true");
  });
});
