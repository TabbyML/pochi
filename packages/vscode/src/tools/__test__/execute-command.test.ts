import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";

type SignalValue = {
  content: string;
  status: "idle" | "running" | "completed";
  isTruncated: boolean;
  error?: string;
  _meta?: {
    backgroundJobId: string;
    outputFile?: string;
  };
};

describe("executeCommand Tool", () => {
  it("persists failed command output before completing", async () => {
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
    await new Promise<void>((resolve) => setImmediate(resolve));

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
    const { executeCommand } = proxyquire
      .noCallThru()
      .load("../execute-command", {
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
      }) as typeof import("../execute-command");
    const abortSignal = new AbortController().signal;

    await assert.rejects(
      async () =>
        executeCommand(
          { command: "npm run dev", cwd: "apps/web", background: true },
          {
            abortSignal,
            cwd: "/workspace",
            messages: [],
            toolCallId: "call-fork-bg",
            taskId: "fork-task",
            allowBackground: false,
          },
        ),
      /Background commands are not available/,
    );
    assert.strictEqual(create.callCount, 0);

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
        'Background job started.\nJob ID: "bgjob-cmd-test"\nOutput file: "/tmp/bgjob-cmd-test.log"\n\nThe output file contains command output only; it does not contain the job\'s status. This confirms only that the job started, not that it completed successfully. Continue any independent work, and do not poll the file for completion. The completion notification is the authoritative status. If no independent work remains, call attemptCompletion to yield the current turn without claiming the job\'s outcome.',
      isTruncated: false,
      _meta: {
        backgroundJobId: "bgjob-cmd-test",
        outputFile: "/tmp/bgjob-cmd-test.log",
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

  for (const allowBackground of [true, false]) {
    it(`handles a foreground timeout with background allowed=${allowBackground}`, async () => {
      const ptyProcess = { kill: sinon.stub() };
      const executeCommandWithPty = sinon.stub().resolves({
        type: "timedOut",
        ptyProcess,
        output: "still running",
        isTruncated: false,
      });
      const adopt = sinon.stub().returns({
        id: "bgjob-cmd-promoted",
        outputFile: "/tmp/bgjob-cmd-promoted.log",
      });
      const maybePersistToolResult = sinon
        .stub()
        .callsFake((_tool, _call, _task, result) => result);
      const getViewColumnForTerminal = sinon.stub().returns(3);
      const { executeCommand } = proxyquire
        .noCallThru()
        .load("../execute-command", {
          "@/integrations/layout": { getViewColumnForTerminal },
          "@/integrations/terminal/terminal-job": {
            TerminalJob: { create: sinon.stub(), adopt },
          },
          "@/lib/background-job-terminal-name": {
            getBackgroundJobTerminalName: () => "Promoted",
          },
          "@getpochi/common": {
            getLogger: () => ({ warn: sinon.stub() }),
          },
          "@getpochi/common/tool-utils": {
            getShellPath: () => "/bin/zsh",
            maybePersistToolResult,
          },
          "@quilted/threads/signals": {
            ThreadSignal: {
              serialize: (signal: {
                value: SignalValue;
                subscribe: (
                  subscriber: (value: SignalValue) => void,
                ) => () => void;
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
            executeCommandWithNode: sinon.stub(),
          },
          "../integrations/terminal/execute-command-with-pty": {
            PtySpawnError: class PtySpawnError extends Error {},
            executeCommandWithPty,
          },
        }) as typeof import("../execute-command");
      const abortSignal = new AbortController().signal;
      const result = await executeCommand(
        { command: "sleep 10", timeout: 1 },
        {
          abortSignal,
          cwd: "/workspace",
          messages: [],
          toolCallId: "call-promoted",
          taskId: "task-1",
          allowBackground,
        },
      );
      const values: SignalValue[] = [];
      (
        (result as unknown as { streamingOutput: unknown }).streamingOutput as {
          start: (subscriber: (value: SignalValue) => void) => () => void;
        }
      ).start((value) => values.push(value));
      await new Promise<void>((resolve) => setImmediate(resolve));

      if (!allowBackground) {
        assert.strictEqual(adopt.callCount, 0);
        assert.strictEqual(ptyProcess.kill.callCount, 1);
        assert.strictEqual(maybePersistToolResult.callCount, 1);
        assert.deepStrictEqual(values.at(-1), {
          content: "still running",
          status: "completed",
          isTruncated: false,
          error: "Command execution timed out after 1 seconds.",
        });
        return;
      }

      assert.ok(
        adopt.calledOnceWithExactly(ptyProcess, {
          name: "Promoted",
          command: "sleep 10",
          cwd: "/workspace",
          location: { viewColumn: 3 },
          abortSignal,
          taskId: "task-1",
        }),
      );
      assert.strictEqual(ptyProcess.kill.callCount, 0);
      assert.strictEqual(maybePersistToolResult.callCount, 0);
      assert.deepStrictEqual(values.at(-1), {
        content:
          'Background job started.\nJob ID: "bgjob-cmd-promoted"\nOutput file: "/tmp/bgjob-cmd-promoted.log"\n\nThe output file contains command output only; it does not contain the job\'s status. The foreground command timed out, but its original process is still running in the background. Do not retry the command in the foreground. Wait for the completion notification instead. Continue any independent work. If no independent work remains, call attemptCompletion to yield the current turn until the notification provides the authoritative status.',
        status: "completed",
        isTruncated: false,
        _meta: {
          backgroundJobId: "bgjob-cmd-promoted",
          outputFile: "/tmp/bgjob-cmd-promoted.log",
        },
      });
    });
  }
});
