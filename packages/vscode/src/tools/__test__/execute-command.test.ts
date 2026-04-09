import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";

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
          "@/integrations/terminal/utils": {
            waitForWebviewSubscription: () => Promise.resolve(),
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
            validateExecuteCommandWhitelist: sinon.stub(),
          },
          "@quilted/threads/signals": {
            ThreadSignal: {
              serialize: (value: unknown) => value,
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

      await clock.tickAsync(100);
      const result = await resultPromise;
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

      assert.deepStrictEqual((result.output as { value: unknown }).value, {
        content: "persisted preview",
        status: "completed",
        isTruncated: true,
        error: "Command exited with code 1",
      });
    } finally {
      clock.restore();
    }
  });
});
