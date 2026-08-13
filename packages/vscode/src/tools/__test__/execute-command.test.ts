import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";

type SignalValue = {
  content: string;
  status: "idle" | "running" | "completed";
  isTruncated: boolean;
  error?: string;
};

describe("executeCommand Tool", () => {
  it("persists failed command output before completing", async () => {
    const clock = sinon.useFakeTimers();
    const maybePersistToolResult = sinon.stub().resolves({
      output: "persisted preview",
      isTruncated: true,
      error: "Command exited with code 1",
    });
    const executeCommandWithNode = sinon.stub().callsFake(async ({ onData }) => {
      onData?.({
        output: "raw noisy output",
        isTruncated: true,
      });
      throw new Error("Command exited with code 1");
    });

    try {
      const { executeCommand } = proxyquire.noCallThru().load(
        "../execute-command",
        {
          "@/integrations/layout": {
            getViewColumnForTerminal: sinon.stub(),
          },
          "@/integrations/terminal/terminal-job": {
            TerminalJob: { create: sinon.stub() },
          },
          "@/lib/background-job-terminal-name": {
            getBackgroundJobTerminalName: sinon.stub(),
          },
          "@getpochi/common": {
            getLogger: () => ({
              warn: sinon.stub(),
            }),
          },
          "@getpochi/common/tool-utils": {
            getShellPath: () => undefined,
            maybePersistToolResult,
          },
          "@getpochi/tools": {
            validateExecuteCommandRules: sinon.stub(),
          },
          "@quilted/threads/signals": {
            ThreadSignal: {
              serialize: (signal: {
                value: SignalValue;
                subscribe: (subscriber: (value: SignalValue) => void) => () => void;
              }) => ({
                get value() {
                  return signal.value;
                },
                start(subscriber: (value: SignalValue) => void) {
                  return signal.subscribe(subscriber);
                },
              }),
            },
          },
          "../integrations/terminal/execute-command-with-node": {
            executeCommandWithNode,
          },
          "../integrations/terminal/execute-command-with-pty": {
            PtySpawnError: class PtySpawnError extends Error {},
            executeCommandWithPty: sinon.stub(),
          },
        },
      ) as typeof import("../execute-command");

      const resultPromise = executeCommand(
        { command: "false" },
        {
          abortSignal: new AbortController().signal,
          cwd: process.cwd(),
          messages: [],
          toolCallId: "call-1",
          taskId: "task-1",
        },
      );

      const result = await resultPromise;
      const values: unknown[] = [];
      (
        (result as unknown as { streamingOutput: unknown }).streamingOutput as {
          start: (subscriber: (value: SignalValue) => void) => () => void;
        }
      ).start((value) => {
        values.push(value);
      });
      await clock.runAllAsync();

      assert.ok(maybePersistToolResult.calledOnce);
      assert.deepStrictEqual(maybePersistToolResult.firstCall.args, [
        "executeCommand",
        "call-1",
        "task-1",
        {
          output: "raw noisy output",
          isTruncated: true,
          error: "Command exited with code 1",
        },
      ]);

      assert.deepStrictEqual(values.at(-1), {
        content: "persisted preview",
        status: "completed",
        isTruncated: true,
        error: "Command exited with code 1",
      });
    } finally {
      clock.restore();
    }
  });

  it("cancels pending throttled output after completion", async () => {
    const maybePersistToolResult = sinon.stub().resolves({
      output: "completed output",
      isTruncated: false,
    });
    const throttledCall = sinon.stub();
    const throttledCancel = sinon.stub();
    const funnel = sinon.stub().returns({
      call: throttledCall,
      cancel: throttledCancel,
      flush: sinon.stub(),
      isIdle: false,
    });

    const executeCommandWithNode = sinon.stub().callsFake(async ({ onData }) => {
      onData?.({
        output: "first output",
        isTruncated: false,
      });
      return {
        output: "completed output",
        isTruncated: false,
      };
    });

    const { executeCommand } = proxyquire.noCallThru().load(
      "../execute-command",
      {
        "@/integrations/layout": {
          getViewColumnForTerminal: sinon.stub(),
        },
        "@/integrations/terminal/terminal-job": {
          TerminalJob: { create: sinon.stub() },
        },
        "@/lib/background-job-terminal-name": {
          getBackgroundJobTerminalName: sinon.stub(),
        },
        "@getpochi/common": {
          getLogger: () => ({
            warn: sinon.stub(),
          }),
        },
        "@getpochi/common/tool-utils": {
          getShellPath: () => undefined,
          maybePersistToolResult,
        },
        "@getpochi/tools": {
          validateExecuteCommandRules: sinon.stub(),
        },
        "@quilted/threads/signals": {
          ThreadSignal: {
            serialize: (signal: {
              value: SignalValue;
              subscribe: (subscriber: (value: SignalValue) => void) => () => void;
            }) => ({
              get value() {
                return signal.value;
              },
              start(subscriber: (value: SignalValue) => void) {
                return signal.subscribe(subscriber);
              },
            }),
          },
        },
        remeda: {
          funnel,
        },
        "../integrations/terminal/execute-command-with-node": {
          executeCommandWithNode,
        },
        "../integrations/terminal/execute-command-with-pty": {
          PtySpawnError: class PtySpawnError extends Error {},
          executeCommandWithPty: sinon.stub(),
        },
      },
    ) as typeof import("../execute-command");

    const result = await executeCommand(
      { command: "echo ok" },
      {
        abortSignal: new AbortController().signal,
        cwd: process.cwd(),
        messages: [],
        toolCallId: "call-1",
        taskId: "task-1",
      },
    );

    (
      (result as unknown as { streamingOutput: unknown }).streamingOutput as {
        start: (subscriber: (value: SignalValue) => void) => () => void;
      }
    ).start(() => {});
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(throttledCancel.calledOnce);
    assert.ok(throttledCall.calledOnce);
  });

  it("starts a TerminalJob and returns its output file in background mode", async () => {
    const create = sinon.stub().returns({
      id: "bgjob-cmd-test",
      outputFile: "/tmp/bgjob-cmd-test.log",
    });
    const getViewColumnForTerminal = sinon.stub().returns(2);
    const getBackgroundJobTerminalName = sinon.stub().returns("Background");
    const { executeCommand } = proxyquire.noCallThru().load(
      "../execute-command",
      {
        "@/integrations/layout": { getViewColumnForTerminal },
        "@/integrations/terminal/terminal-job": {
          TerminalJob: { create },
        },
        "@/lib/background-job-terminal-name": {
          getBackgroundJobTerminalName,
        },
        "@getpochi/common": {
          getLogger: () => ({ warn: sinon.stub() }),
        },
        "@getpochi/common/tool-utils": {
          getShellPath: sinon.stub(),
          maybePersistToolResult: sinon.stub(),
        },
        "@quilted/threads/signals": {
          ThreadSignal: { serialize: sinon.stub() },
        },
        "../integrations/terminal/execute-command-with-node": {
          executeCommandWithNode: sinon.stub(),
        },
        "../integrations/terminal/execute-command-with-pty": {
          PtySpawnError: class PtySpawnError extends Error {},
          executeCommandWithPty: sinon.stub(),
        },
      },
    ) as typeof import("../execute-command");
    const abortSignal = new AbortController().signal;

    const result = await executeCommand(
      { command: "npm run dev", cwd: "apps/web", background: true },
      {
        abortSignal,
        cwd: "/workspace",
        messages: [],
        toolCallId: "call-bg",
        taskId: "task-1",
      },
    );

    assert.deepStrictEqual(result, {
      output:
        'Background command started with ID "bgjob-cmd-test". Output is being written to "/tmp/bgjob-cmd-test.log"; use readFile to read it.',
      isTruncated: false,
      _meta: {
        backgroundJobId: "bgjob-cmd-test",
      },
    });
    assert.ok(
      create.calledOnceWithExactly({
        name: "Background",
        command: "npm run dev",
        cwd: "/workspace/apps/web",
        location: { viewColumn: 2 },
        abortSignal,
        taskId: "task-1",
      }),
    );
  });
});
