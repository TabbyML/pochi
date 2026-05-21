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
        result.output as unknown as {
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
      result.output as unknown as {
        start: (subscriber: (value: SignalValue) => void) => () => void;
      }
    ).start(() => {});
    await Promise.resolve();
    await Promise.resolve();

    assert.ok(throttledCancel.calledOnce);
    assert.ok(throttledCall.calledOnce);
  });
});
