import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { describe, it } from "mocha";
import sinon from "sinon";
import proxyquire from "proxyquire";
import { buildExecuteCommandEnv } from "../execute-command-with-node";

function createMockChildProcess(options?: { withStdin?: boolean }) {
  const child = new EventEmitter() as EventEmitter & {
    stdout?: EventEmitter;
    stderr?: EventEmitter;
    stdin?: { end: sinon.SinonSpy };
    kill: sinon.SinonSpy;
  };

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = sinon.spy();
  if (options?.withStdin !== false) {
    child.stdin = {
      end: sinon.spy(),
    };
  }

  return child;
}

describe("execute-command-with-node", () => {
  it("should enforce non-interactive terminal env precedence", () => {
    const env = buildExecuteCommandEnv({
      color: true,
      envs: {
        GIT_TERMINAL_PROMPT: "1",
        GCM_INTERACTIVE: "always",
      },
    });

    assert.strictEqual(env.GIT_TERMINAL_PROMPT, "0");
    assert.strictEqual(env.GCM_INTERACTIVE, "never");
    assert.strictEqual(env.CLICOLOR_FORCE, "1");
  });

  it("should spawn with ignored stdin in shell-command path", async () => {
    const spawnStub = sinon.stub().callsFake(() => {
      const child = createMockChildProcess({ withStdin: false });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });

    const executeCommandWithNode = proxyquire
      .noCallThru()
      .load("../execute-command-with-node", {
        "node:child_process": {
          spawn: spawnStub,
          exec: sinon.stub(),
        },
        "@getpochi/common/tool-utils": {
          buildShellCommand: () => ({
            command: "/bin/bash",
            args: ["-c", "echo hello"],
          }),
          fixExecuteCommandOutput: (output: string) => output,
        },
        "@getpochi/common/env-utils": {
          getTerminalEnv: () => ({
            GIT_TERMINAL_PROMPT: "0",
            GCM_INTERACTIVE: "never",
          }),
        },
      }).executeCommandWithNode as typeof import("../execute-command-with-node").executeCommandWithNode;

    await executeCommandWithNode({
      command: "echo hello",
      cwd: process.cwd(),
      timeout: 0,
      color: false,
    });

    assert.ok(spawnStub.calledOnce);
    const spawnOptions = spawnStub.firstCall.args[2] as {
      stdio?: string[];
      env?: NodeJS.ProcessEnv;
    };
    assert.deepStrictEqual(spawnOptions.stdio, ["ignore", "pipe", "pipe"]);
    assert.strictEqual(spawnOptions.env?.GIT_TERMINAL_PROMPT, "0");
    assert.strictEqual(spawnOptions.env?.GCM_INTERACTIVE, "never");
  });

  it("should close stdin in exec fallback path", async () => {
    const child = createMockChildProcess({ withStdin: true });
    const execStub = sinon.stub().callsFake(() => {
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });

    const executeCommandWithNode = proxyquire
      .noCallThru()
      .load("../execute-command-with-node", {
        "node:child_process": {
          spawn: sinon.stub(),
          exec: execStub,
        },
        "@getpochi/common/tool-utils": {
          buildShellCommand: () => undefined,
          fixExecuteCommandOutput: (output: string) => output,
        },
        "@getpochi/common/env-utils": {
          getTerminalEnv: () => ({
            GIT_TERMINAL_PROMPT: "0",
            GCM_INTERACTIVE: "never",
          }),
        },
      }).executeCommandWithNode as typeof import("../execute-command-with-node").executeCommandWithNode;

    await executeCommandWithNode({
      command: "cat",
      cwd: process.cwd(),
      timeout: 0,
      color: false,
    });

    assert.ok(execStub.calledOnce);
    assert.ok(child.stdin?.end.calledOnce);
  });
});
