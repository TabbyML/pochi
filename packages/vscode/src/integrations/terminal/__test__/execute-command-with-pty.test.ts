import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";
import {
  buildPtyEnv,
  buildPtyShellCommand,
  executeCommandWithPty,
  getNodePtyModulePaths,
} from "../execute-command-with-pty";

describe("execute-command-with-pty", () => {
  it("loads VS Code's packaged node-pty before its unpacked fallback", () => {
    assert.deepStrictEqual(getNodePtyModulePaths("/vscode/app"), [
      "/vscode/app/node_modules.asar/node-pty",
      "/vscode/app/node_modules/node-pty",
    ]);
  });

  it("spawns with VS Code's packaged node-pty", async function () {
    if (process.platform === "win32") this.skip();

    const result = await executeCommandWithPty({
      command: "printf pty-runtime-ok",
      cwd: process.cwd(),
      timeout: 5,
    });

    assert.strictEqual(result.type, "completed");
    assert.ok(result.output.includes("pty-runtime-ok"));
    assert.ok(!result.output.includes("\u001b]6339;"));
  });

  it("reports a spawn error when the shell binary cannot be executed", async function () {
    if (process.platform === "win32") this.skip();

    const originalShell = process.env.SHELL;
    process.env.SHELL = "/nonexistent/pochi/bash";
    try {
      await assert.rejects(
        executeCommandWithPty({
          command: "echo hello",
          cwd: process.cwd(),
          timeout: 5,
        }),
        (error: Error) => {
          assert.strictEqual(error.name, "PtySpawnError");
          return true;
        },
      );
    } finally {
      process.env.SHELL = originalShell;
    }
  });

  it("builds an interactive shell command without detaching stdin", () => {
    const shellCommand = buildPtyShellCommand("echo hello");
    assert.ok(shellCommand, "Expected a shell command to be built");
    assert.ok(shellCommand.args.at(-1)?.includes("echo hello"));
    assert.ok(!shellCommand.args.at(-1)?.includes("</dev/null"));
  });

  it("emits a launch marker before the command on posix shells", function () {
    if (process.platform === "win32") this.skip();

    const shellCommand = buildPtyShellCommand("echo hello");
    assert.ok(shellCommand?.launchNonce, "Expected a launch nonce");
    assert.ok(
      shellCommand.args
        .at(-1)
        ?.startsWith(`printf '\\033]6339;%s\\007' ${shellCommand.launchNonce}\n`),
    );
  });

  it("enforces terminal environment precedence", () => {
    const env = buildPtyEnv({
      GIT_TERMINAL_PROMPT: "1",
      GCM_INTERACTIVE: "always",
    });

    assert.strictEqual(env.GIT_TERMINAL_PROMPT, "0");
    assert.strictEqual(env.GCM_INTERACTIVE, "never");
    assert.strictEqual(env.GIT_EDITOR, "true");
  });

  it("returns the running pty instead of killing it on timeout", async () => {
    const clock = sinon.useFakeTimers();
    let dataListener: ((data: string) => void) | undefined;
    let exitListener: ((event: { exitCode: number }) => void) | undefined;
    const ptyProcess = {
      kill: sinon.stub(),
      subscribeWithReplay: (listener: (data: string) => void) => {
        dataListener = listener;
        return { replay: [], disposable: { dispose: sinon.stub() } };
      },
      onExit: (listener: (event: { exitCode: number }) => void) => {
        exitListener = listener;
        return { dispose: sinon.stub() };
      },
    };
    const spawn = sinon.stub().resolves(ptyProcess);
    const { executeCommandWithPty } = proxyquire
      .noCallThru()
      .noPreserveCache()
      .load("../execute-command-with-pty", {
        "./pty-process": {
          PtyProcess: { spawn },
        },
      }) as typeof import("../execute-command-with-pty");

    try {
      const resultPromise = executeCommandWithPty({
        command: "sleep 10",
        cwd: "/tmp",
        timeout: 1,
      });
      await Promise.resolve();
      dataListener?.("started\n");
      await clock.tickAsync(1_000);
      const result = await resultPromise;

      assert.strictEqual(result.type, "timedOut");
      assert.strictEqual(
        result.type === "timedOut" ? result.ptyProcess : undefined,
        ptyProcess,
      );
      assert.strictEqual(result.output, "started\n");
      assert.strictEqual(ptyProcess.kill.callCount, 0);
      assert.ok(exitListener);
    } finally {
      clock.restore();
    }
  });

  it("treats a natural signal exit as a command failure", async () => {
    let exitListener:
      | ((event: { exitCode: number; signal?: number }) => void)
      | undefined;
    const ptyProcess = {
      kill: sinon.stub(),
      subscribeWithReplay: () => ({
        replay: [],
        disposable: { dispose: sinon.stub() },
      }),
      onExit: (
        listener: (event: { exitCode: number; signal?: number }) => void,
      ) => {
        exitListener = listener;
        return { dispose: sinon.stub() };
      },
    };
    const spawn = sinon.stub().resolves(ptyProcess);
    const { executeCommandWithPty } = proxyquire
      .noCallThru()
      .noPreserveCache()
      .load("../execute-command-with-pty", {
        "./pty-process": {
          PtyProcess: { spawn },
        },
      }) as typeof import("../execute-command-with-pty");

    const resultPromise = executeCommandWithPty({
      command: "kill -TERM $$",
      cwd: "/tmp",
      timeout: 5,
    });
    await Promise.resolve();
    exitListener?.({ exitCode: 0, signal: 15 });

    await assert.rejects(resultPromise, /exited with code 143/);
  });
});
