import * as assert from "node:assert";
import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";

interface Disposable {
  dispose(): void;
}

class TestEventEmitter<T> {
  private listeners: Array<((event: T) => void) | undefined> = [];

  readonly event = (listener: (event: T) => void): Disposable => {
    const index = this.listeners.length;
    this.listeners.push(listener);

    return {
      dispose: () => {
        this.listeners[index] = undefined;
      },
    };
  };

  fire(event: T): void {
    const listenerCount = this.listeners.length;
    for (let i = 0; i < listenerCount; i++) {
      this.listeners[i]?.(event);
    }
  }
}

class TestExecutionError extends Error {
  static create(message: string): TestExecutionError {
    return new TestExecutionError(message);
  }

  static createAbortError(): TestExecutionError {
    return new TestExecutionError("Background job aborted.");
  }
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function createHarness(options?: { read?: () => AsyncIterable<string> }) {
  const closeEmitter = new TestEventEmitter<FakeTerminal>();
  const shellIntegrationEmitter = new TestEventEmitter<{
    terminal: FakeTerminal;
    shellIntegration: FakeShellIntegration;
  }>();
  const executionEndEmitter = new TestEventEmitter<{
    execution: FakeExecution;
    exitCode: number | undefined;
  }>();
  const execution: FakeExecution = {
    read: options?.read ?? (async function* () {}),
  };
  const shellIntegration: FakeShellIntegration = {
    executeCommand: () => execution,
  };
  let terminalDisposeCalls = 0;
  const terminal: FakeTerminal = {
    shellIntegration,
    show: () => {},
    dispose: () => {
      terminalDisposeCalls++;
      closeEmitter.fire(terminal);
    },
  };
  const finalizeCalls: Array<TestExecutionError | undefined> = [];
  const lifecycle: string[] = [];
  const outputManager = {
    output: { value: undefined },
    addChunk: () => {},
    finalize: (error?: TestExecutionError) => finalizeCalls.push(error),
  };

  const vscode = {
    EventEmitter: TestEventEmitter,
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    window: {
      onDidCloseTerminal: closeEmitter.event,
      onDidChangeTerminalShellIntegration: shellIntegrationEmitter.event,
      onDidEndTerminalShellExecution: executionEndEmitter.event,
    },
  };

  const { TerminalJob } = proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../terminal-job", {
      vscode,
      "../layout": {
        createTerminal: () => terminal,
      },
      "@/lib/logger": {
        getLogger: () => ({
          debug: () => {},
          info: () => {},
        }),
      },
      "@getpochi/common/env-utils": {
        getTerminalEnv: () => ({}),
      },
      "@getpochi/common/tool-utils": {
        BackgroundJobOutputFile: class {
          async append(chunk: string) {
            lifecycle.push(`output:${chunk}`);
          }
          async close() {
            lifecycle.push("file-closed");
          }
        },
        PlainOutputSanitizer: class {
          write(chunk: string) {
            return chunk;
          }
          end() {
            return "";
          }
        },
        createBackgroundJobId: () => "bgjob-cmd-test",
        getBackgroundJobOutputPath: () => "/tmp/bgjob-cmd-test.log",
        getShellPath: () => "/bin/sh",
      },
      "./output": {
        OutputManager: {
          create: () => outputManager,
        },
      },
      "./utils": {
        ExecutionError: TestExecutionError,
      },
    }) as typeof import("../terminal-job");

  const job = TerminalJob.create({
    name: "test job",
    command: "sleep 10",
    cwd: "/tmp",
    taskId: "task-test",
  });
  const finishEvents: BackgroundJobTerminalEvent[] = [];
  TerminalJob.onDidFinish((event) => {
    lifecycle.push("event-fired");
    finishEvents.push(event);
  });

  return {
    TerminalJob,
    closeEmitter,
    execution,
    executionEndEmitter,
    finalizeCalls,
    finishEvents,
    job,
    lifecycle,
    terminal,
    get terminalDisposeCalls() {
      return terminalDisposeCalls;
    },
  };
}

interface FakeExecution {
  read(): AsyncIterable<string>;
}

interface FakeShellIntegration {
  executeCommand(command: string): FakeExecution;
}

interface FakeTerminal {
  shellIntegration: FakeShellIntegration;
  show(): void;
  dispose(): void;
}

describe("TerminalJob", () => {
  it("closes the terminal after a background command completes", async () => {
    const harness = createHarness();

    await flushPromises();
    harness.executionEndEmitter.fire({
      execution: harness.execution,
      exitCode: 0,
    });
    await flushPromises();

    assert.strictEqual(harness.finalizeCalls.length, 1);
    assert.strictEqual(harness.finalizeCalls[0], undefined);
    assert.deepStrictEqual(harness.lifecycle, [
      "output:$ sleep 10\n",
      "file-closed",
      "event-fired",
    ]);
    assert.deepStrictEqual(harness.finishEvents, [
      {
        taskId: "task-test",
        backgroundJobId: "bgjob-cmd-test",
        outputFile: "/tmp/bgjob-cmd-test.log",
        status: "completed",
        command: "sleep 10",
        exitCode: 0,
        finishedAt: harness.finishEvents[0]?.finishedAt,
      },
    ]);
    assert.strictEqual(harness.terminalDisposeCalls, 1);
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });

  it("finalizes a running job when its terminal closes", async () => {
    const { TerminalJob, finalizeCalls, job, terminal } = createHarness();

    await flushPromises();
    terminal.dispose();
    await flushPromises();

    assert.strictEqual(TerminalJob.get(job.id), undefined);
    assert.strictEqual(finalizeCalls.length, 1);
    assert.match(
      finalizeCalls[0]?.message ?? "",
      /user closed terminal/,
    );
  });

  it("waits for trailing output before notifying about a failed job", async () => {
    let releaseOutput: (() => void) | undefined;
    const outputReady = new Promise<void>((resolve) => {
      releaseOutput = resolve;
    });
    const harness = createHarness({
      read: async function* () {
        await outputReady;
        yield "failure details";
      },
    });

    await flushPromises();
    harness.executionEndEmitter.fire({
      execution: harness.execution,
      exitCode: 1,
    });
    await flushPromises();

    assert.strictEqual(harness.finishEvents.length, 0);
    assert.deepStrictEqual(harness.lifecycle, ["output:$ sleep 10\n"]);

    releaseOutput?.();
    await flushPromises();
    await flushPromises();

    assert.deepStrictEqual(harness.lifecycle, [
      "output:$ sleep 10\n",
      "output:failure details",
      "file-closed",
      "event-fired",
    ]);
    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
    assert.strictEqual(harness.finishEvents[0]?.exitCode, 1);
  });

  it("notifies when a background command fails without command output", async () => {
    const harness = createHarness();

    await flushPromises();
    harness.executionEndEmitter.fire({
      execution: harness.execution,
      exitCode: 2,
    });
    await flushPromises();

    assert.strictEqual(harness.finalizeCalls.length, 1);
    assert.deepStrictEqual(harness.lifecycle, [
      "output:$ sleep 10\n",
      "file-closed",
      "event-fired",
    ]);
    assert.strictEqual(harness.finishEvents.length, 1);
    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
    assert.strictEqual(harness.finishEvents[0]?.exitCode, 2);
    assert.match(
      harness.finishEvents[0]?.error ?? "",
      /exited with code 2/,
    );
    assert.strictEqual(harness.terminalDisposeCalls, 1);
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });
});
