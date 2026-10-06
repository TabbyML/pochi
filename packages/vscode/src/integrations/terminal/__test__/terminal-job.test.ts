import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type {
  BackgroundJobTerminalEvent,
  BackgroundMonitorNotification,
  MonitorJobOptions,
} from "@getpochi/common";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";

interface Disposable {
  dispose(): void;
}

class TestEventEmitter<T> {
  private listeners = new Set<(event: T) => void>();
  readonly event = (listener: (event: T) => void): Disposable => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: T): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

class TestPtyProcess {
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<
    (event: { exitCode: number; signal?: number }) => void
  >();
  readonly replay: string[] = [];
  killCalls = 0;
  groupKillCalls = 0;
  groupTermination: Promise<void> = Promise.resolve();
  pauseCalls = 0;
  resumeCalls = 0;

  subscribeWithReplay(listener: (data: string) => void) {
    this.dataListeners.add(listener);
    return {
      replay: [...this.replay],
      disposable: { dispose: () => this.dataListeners.delete(listener) },
    };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  emitData(data: string): void {
    this.replay.push(data);
    for (const listener of [...this.dataListeners]) listener(data);
  }

  emitExit(exitCode: number, signal?: number): void {
    for (const listener of [...this.exitListeners]) {
      listener({ exitCode, ...(signal !== undefined ? { signal } : {}) });
    }
  }

  kill(): void {
    this.killCalls++;
  }

  killProcessGroup(): Promise<void> {
    this.groupKillCalls++;
    return this.groupTermination;
  }

  pauseOutput(): void {
    this.pauseCalls++;
  }

  resumeOutput(): void {
    this.resumeCalls++;
  }
}

class TestExecutionError extends Error {
  aborted = false;

  static create(message: string) {
    return new TestExecutionError(message);
  }

  static createAbortError() {
    const error = new TestExecutionError("aborted");
    error.aborted = true;
    return error;
  }
}

async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function createHarness(options?: {
  replay?: string[];
  monitor?: MonitorJobOptions;
  appendError?: Error;
  closeError?: Error;
  createTerminalError?: Error;
}) {
  const closeEmitter = new TestEventEmitter<FakeTerminal>();
  let terminalDisposeCalls = 0;
  let terminalShowCalls = 0;
  const terminalShowPreserveFocus: Array<boolean | undefined> = [];
  const terminal: FakeTerminal = {
    show: (preserveFocus) => {
      terminalShowCalls++;
      terminalShowPreserveFocus.push(preserveFocus);
    },
    dispose: () => {
      terminalDisposeCalls++;
      closeEmitter.fire(terminal);
    },
  };
  const lifecycle: string[] = [];
  const finalizeCalls: Array<TestExecutionError | undefined> = [];
  const ptyTerminalCloseCallbacks: Array<() => void> = [];
  const ptyProcess = new TestPtyProcess();
  ptyProcess.replay.push(...(options?.replay ?? []));

  const vscode = {
    EventEmitter: TestEventEmitter,
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    window: { onDidCloseTerminal: closeEmitter.event },
  };

  const outputManager = {
    output: { value: undefined },
    addChunk: (chunk: string) => lifecycle.push(`manager:${chunk}`),
    finalize: (error?: TestExecutionError) => finalizeCalls.push(error),
  };

  const { TerminalJob } = proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../terminal-job", {
      vscode,
      "../layout": {
        createTerminal: () => {
          if (options?.createTerminalError) throw options.createTerminalError;
          return terminal;
        },
      },
      "@/lib/logger": {
        getLogger: () => ({ debug: () => {}, info: () => {} }),
      },
      "@getpochi/common/tool-utils": {
        BackgroundJobOutputFile: class {
          async append(chunk: string) {
            lifecycle.push(`output:${chunk}`);
            if (options?.appendError) throw options.appendError;
          }
          async close() {
            lifecycle.push("file-closed");
            if (options?.closeError) throw options.closeError;
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
        createBackgroundJobId: (kind: string) =>
          `bgjob-${kind === "monitor" ? "monitor" : "cmd"}-test`,
        getBackgroundJobOutputPath: () => "/tmp/bgjob-cmd-test.log",
      },
      "./output": {
        OutputManager: {
          create: () => outputManager,
          delete: () => lifecycle.push("manager-deleted"),
        },
      },
      "./pty-terminal": {
        PtyTerminal: class {
          private readonly exitSubscription: Disposable;
          constructor(
            process: TestPtyProcess,
            onCloseRequested: () => void,
          ) {
            ptyTerminalCloseCallbacks.push(onCloseRequested);
            this.exitSubscription = process.onExit(() => {
              closeEmitter.fire(terminal);
            });
          }
          dispose() {
            this.exitSubscription.dispose();
          }
        },
      },
      "./utils": { ExecutionError: TestExecutionError },
    }) as typeof import("../terminal-job");

  const monitorEvents: BackgroundMonitorNotification[] = [];
  TerminalJob.onDidMonitorEvent(({ event }) => monitorEvents.push(event));
  const finishEvents: BackgroundJobTerminalEvent[] = [];
  TerminalJob.onDidFinish((event) => {
    lifecycle.push("event-fired");
    finishEvents.push(event);
  });
  let job: ReturnType<typeof TerminalJob.adopt> | undefined;
  let adoptionError: unknown;
  try {
    job = TerminalJob.adopt(ptyProcess as never, {
      name: "test job",
      command: "sleep 10",
      cwd: "/tmp",
      taskId: "task-test",
      monitor: options?.monitor,
    });
  } catch (error) {
    adoptionError = error;
  }

  return {
    TerminalJob,
    adoptionError,
    finalizeCalls,
    finishEvents,
    monitorEvents,
    job: job as ReturnType<typeof TerminalJob.adopt>,
    lifecycle,
    ptyProcess,
    ptyTerminalCloseCallbacks,
    terminal,
    get terminalDisposeCalls() {
      return terminalDisposeCalls;
    },
    get terminalShowCalls() {
      return terminalShowCalls;
    },
    terminalShowPreserveFocus,
  };
}

interface FakeTerminal {
  show(preserveFocus?: boolean): void;
  dispose(): void;
}

describe("TerminalJob", () => {
  it("waits for monitor group cleanup before publishing the end or releasing its transcript", async () => {
    const harness = createHarness({ monitor: { description: "watch" } });
    let finishCleanup!: () => void;
    harness.ptyProcess.groupTermination = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    harness.job.kill();
    harness.job.kill();
    harness.ptyProcess.emitData("last output\n");
    harness.ptyProcess.emitExit(143);
    await flushPromises();
    assert.strictEqual(harness.ptyProcess.groupKillCalls, 1);
    assert.strictEqual(harness.ptyProcess.killCalls, 0);
    assert.ok(!harness.monitorEvents.some((event) => event.ended));
    assert.ok(!harness.lifecycle.includes("file-closed"));
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), harness.job);

    finishCleanup();
    await flushPromises();
    assert.strictEqual(harness.monitorEvents.at(-1)?.ended?.status, "stopped");
    assert.strictEqual(harness.monitorEvents.at(-1)?.ended?.reason, "kill requested");
    assert.strictEqual(
      harness.monitorEvents.filter((event) => event.ended).length,
      1,
    );
    assert.ok(
      harness.monitorEvents
        .flatMap((event) => event.lines)
        .includes("last output"),
    );
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });

  it("reports monitor cleanup failure even when the shell never exits", async () => {
    const harness = createHarness({ monitor: { description: "watch" } });
    harness.ptyProcess.groupTermination = Promise.reject(
      new Error("Cannot terminate group: EPERM"),
    );
    harness.job.kill();
    await flushPromises();
    assert.strictEqual(harness.monitorEvents.at(-1)?.ended?.status, "failed");
    assert.match(harness.monitorEvents.at(-1)?.ended?.reason ?? "", /EPERM/);
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });

  it("monitors replayed and live output without echo, finalizes once, and releases the job", async () => {
    const harness = createHarness({
      replay: ["first\n"],
      monitor: { description: "watch" },
    });
    assert.ifError(harness.adoptionError);
    assert.strictEqual(harness.job.id, "bgjob-monitor-test");
    harness.ptyProcess.emitData("last\n");
    harness.ptyProcess.emitExit(0);
    await flushPromises();
    assert.deepStrictEqual(
      harness.monitorEvents.flatMap((event) => event.lines),
      ["first", "last"],
    );
    assert.strictEqual(
      harness.monitorEvents.filter((event) => event.ended).length,
      1,
    );
    assert.strictEqual(
      harness.monitorEvents.at(-1)?.ended?.status,
      "completed",
    );
    assert.deepStrictEqual(harness.finishEvents, []);
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
    assert.ok(harness.lifecycle.includes("file-closed"));
  });

  it("keeps an adopted pty running when terminal view creation fails", async () => {
    const initializationError = new Error("terminal creation failed");
    const harness = createHarness({ createTerminalError: initializationError });

    assert.throws(() => harness.job.show(), initializationError);
    assert.strictEqual(harness.adoptionError, undefined);
    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.ptyProcess.killCalls, 0);
    assert.strictEqual(
      harness.TerminalJob.get("bgjob-cmd-test"),
      harness.job,
    );

    harness.ptyProcess.emitExit(0);
    await flushPromises();
  });

  it("replays foreground output and completes", async () => {
    const harness = createHarness({ replay: ["before timeout\n"] });
    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.job.isFinished, false);

    harness.ptyProcess.emitData("after timeout\n");
    harness.ptyProcess.emitExit(0);
    await flushPromises();

    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.job.isFinished, true);
    assert.deepStrictEqual(harness.lifecycle, [
      "output:$ sleep 10\n",
      "manager:$ sleep 10\n",
      "output:before timeout\n",
      "manager:before timeout\n",
      "output:after timeout\n",
      "manager:after timeout\n",
      "file-closed",
      "event-fired",
      "manager-deleted",
    ]);
    assert.strictEqual(harness.finishEvents[0]?.status, "completed");
    assert.strictEqual(harness.terminalDisposeCalls, 0);
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });

  it("applies backpressure while persisted pty output is queued", async () => {
    const harness = createHarness();
    const chunk = "x".repeat(600 * 1024);

    harness.ptyProcess.emitData(chunk);
    harness.ptyProcess.emitData(chunk);
    assert.strictEqual(harness.ptyProcess.pauseCalls, 1);

    await flushPromises();
    assert.strictEqual(harness.ptyProcess.resumeCalls, 1);

    harness.ptyProcess.emitExit(0);
    await flushPromises();
  });

  it("opens, detaches, and recreates the terminal without stopping the pty", async () => {
    const harness = createHarness();
    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.terminalShowCalls, 0);

    harness.job.show();

    assert.strictEqual(harness.job.isVisible, true);
    assert.strictEqual(harness.terminalShowCalls, 1);
    assert.deepStrictEqual(harness.terminalShowPreserveFocus, [false]);

    harness.job.hide();

    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.ptyProcess.killCalls, 0);
    assert.strictEqual(harness.terminalDisposeCalls, 1);

    harness.job.show();

    assert.strictEqual(harness.job.isVisible, true);
    assert.strictEqual(harness.ptyProcess.killCalls, 0);
    assert.strictEqual(harness.terminalShowCalls, 2);
    assert.deepStrictEqual(harness.terminalShowPreserveFocus, [false, false]);

    harness.ptyTerminalCloseCallbacks[0]?.();
    assert.strictEqual(harness.job.isVisible, true);

    harness.ptyProcess.emitExit(0);
    await flushPromises();
  });

  it("keeps the pty running when the VS Code terminal is closed", async () => {
    const harness = createHarness();
    harness.job.show();

    harness.terminal.dispose();

    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.ptyProcess.killCalls, 0);

    harness.ptyProcess.emitExit(0);
    await flushPromises();
  });

  it("closes the terminal when explicitly closing the pty process", async () => {
    const harness = createHarness();
    harness.job.show();

    harness.job.closePtyProcess();

    assert.strictEqual(harness.job.isVisible, false);
    assert.strictEqual(harness.terminalDisposeCalls, 1);
    assert.strictEqual(harness.ptyProcess.killCalls, 1);

    harness.ptyProcess.emitExit(143);
    await flushPromises();
    assert.strictEqual(harness.finishEvents[0]?.status, "stopped");
  });

  it("marks a killed command as stopped", async () => {
    const harness = createHarness();
    harness.job.kill();
    assert.strictEqual(harness.ptyProcess.killCalls, 1);

    harness.ptyProcess.emitExit(143);
    await flushPromises();

    assert.strictEqual(harness.finishEvents[0]?.status, "stopped");
    assert.strictEqual(harness.terminalDisposeCalls, 0);
  });

  it("marks a nonzero natural exit as failed", async () => {
    const harness = createHarness();
    harness.ptyProcess.emitExit(2);
    await flushPromises();

    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
    assert.strictEqual(harness.finishEvents[0]?.exitCode, 2);
    assert.match(harness.finishEvents[0]?.error ?? "", /exited with code 2/);
  });

  it("marks a natural signal exit as failed", async () => {
    const harness = createHarness();
    harness.ptyProcess.emitExit(0, 15);
    await flushPromises();

    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
    assert.strictEqual(harness.finishEvents[0]?.exitCode, 143);
    assert.match(harness.finishEvents[0]?.error ?? "", /signal 15/);
  });

  it("publishes a close failure through the output manager", async () => {
    const harness = createHarness({ closeError: new Error("flush failed") });
    harness.ptyProcess.emitExit(0);
    await flushPromises();

    assert.match(harness.finalizeCalls[0]?.message ?? "", /flush failed/);
    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
  });

  it("observes output persistence failures before process exit", async () => {
    const harness = createHarness({
      appendError: new Error("output disk full"),
    });
    await flushPromises();

    assert.strictEqual(harness.ptyProcess.killCalls, 1);
    assert.strictEqual(harness.finishEvents.length, 0);

    harness.ptyProcess.emitExit(143);
    await flushPromises();
    assert.strictEqual(harness.finishEvents[0]?.status, "stopped");
    assert.match(harness.finishEvents[0]?.error ?? "", /output disk full/);
  });

  it("removes an interrupted replacement marker", async () => {
    const harness = createHarness();
    harness.ptyProcess.emitData("ready\uFFFD^C\r\n");
    harness.job.kill();
    harness.ptyProcess.emitExit(130);
    await flushPromises();

    assert.ok(harness.lifecycle.includes("output:ready"));
    assert.ok(!harness.lifecycle.some((entry) => entry.includes("\uFFFD")));
  });

  it("preserves a replacement character after normal completion", async () => {
    const harness = createHarness();
    harness.ptyProcess.emitData("valid replacement: \uFFFD");
    harness.ptyProcess.emitExit(0);
    await flushPromises();

    assert.ok(harness.lifecycle.includes("output:\uFFFD"));
  });
});

class TestChildProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
}

async function createChildHarness(options?: {
  monitor?: MonitorJobOptions;
  aborted?: boolean;
}) {
  class TestPtySpawnError extends Error {
    cause = new Error("pty unavailable");
  }
  const child = new TestChildProcess();
  const lifecycle: string[] = [];
  const spawnCalls: Array<{ command: string; cwd: string }> = [];
  const shownDocuments: string[] = [];
  let terminateCalls = 0;
  let termination: Promise<void> = Promise.resolve();
  const vscode = {
    EventEmitter: TestEventEmitter,
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    window: {
      onDidCloseTerminal: new TestEventEmitter<FakeTerminal>().event,
      showTextDocument: async (uri: { fsPath: string }) => {
        shownDocuments.push(uri.fsPath);
      },
    },
  };
  const { TerminalJob } = proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../terminal-job", {
      vscode,
      "../layout": {
        createTerminal: () => {
          throw new Error("child process jobs have no terminal");
        },
      },
      "@/lib/logger": {
        getLogger: () => ({ debug: () => {}, info: () => {}, warn: () => {} }),
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
        createBackgroundJobId: (kind: string) =>
          `bgjob-${kind === "monitor" ? "monitor" : "cmd"}-child`,
        getBackgroundJobOutputPath: () => "/tmp/bgjob-cmd-child.log",
      },
      "./background-child-process": {
        spawnBackgroundChildProcess: (config: {
          command: string;
          cwd: string;
        }) => {
          spawnCalls.push(config);
          return child;
        },
        terminateChildProcessTree: () => {
          terminateCalls++;
          return termination;
        },
      },
      "./output": {
        OutputManager: {
          create: () => ({
            output: { value: undefined },
            addChunk: () => {},
            finalize: () => {},
          }),
          delete: () => {},
        },
      },
      "./pty-process": {
        PtyProcess: {
          spawn: async () => {
            throw new TestPtySpawnError();
          },
        },
        PtySpawnError: TestPtySpawnError,
      },
      "./pty-terminal": { PtyTerminal: class {} },
      "./utils": { ExecutionError: TestExecutionError },
    }) as typeof import("../terminal-job");

  const finishEvents: BackgroundJobTerminalEvent[] = [];
  TerminalJob.onDidFinish((event) => finishEvents.push(event));
  const monitorEvents: BackgroundMonitorNotification[] = [];
  TerminalJob.onDidMonitorEvent(({ event }) => monitorEvents.push(event));
  const abortController = new AbortController();
  if (options?.aborted) abortController.abort();
  const job = await TerminalJob.create({
    name: "child job",
    command: "npm run dev",
    cwd: "/tmp",
    taskId: "task-test",
    abortSignal: abortController.signal,
    monitor: options?.monitor,
  });

  return {
    TerminalJob,
    child,
    finishEvents,
    job,
    lifecycle,
    monitorEvents,
    shownDocuments,
    spawnCalls,
    get terminateCalls() {
      return terminateCalls;
    },
    set termination(value: Promise<void>) {
      termination = value;
    },
  };
}

describe("TerminalJob child process backend", () => {
  it("does not spawn a command for an already-aborted job", async () => {
    const harness = await createChildHarness({ aborted: true });
    await flushPromises();

    assert.deepStrictEqual(harness.spawnCalls, []);
    assert.strictEqual(harness.finishEvents[0]?.status, "stopped");
  });

  it("runs without a terminal and persists decoded output", async () => {
    const harness = await createChildHarness();
    assert.deepStrictEqual(harness.spawnCalls[0], {
      command: "npm run dev",
      cwd: "/tmp",
      envs: undefined,
    });
    assert.strictEqual(harness.job.isPtyTerminal, false);

    const text = Buffer.from("你好\n");
    harness.child.stdout.emit("data", text.subarray(0, 2));
    harness.child.stdout.emit("data", text.subarray(2));
    harness.child.stderr.emit("data", Buffer.from("warning\n"));
    harness.child.emit("close", 0, null);
    await flushPromises();

    assert.deepStrictEqual(harness.lifecycle, [
      "output:$ npm run dev\n",
      "output:你好\n",
      "output:warning\n",
      "file-closed",
    ]);
    assert.strictEqual(harness.finishEvents[0]?.status, "completed");
    assert.strictEqual(harness.finishEvents[0]?.exitCode, 0);
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });

  it("opens the output file instead of a terminal view", async () => {
    const harness = await createChildHarness();
    harness.job.show();
    await flushPromises();

    assert.deepStrictEqual(harness.shownDocuments, [
      "/tmp/bgjob-cmd-child.log",
    ]);
    assert.strictEqual(harness.job.isVisible, false);

    harness.child.emit("close", 0, null);
    await flushPromises();
  });

  it("stops the process tree and waits for it before reporting", async () => {
    const harness = await createChildHarness();
    let finishTermination!: () => void;
    harness.termination = new Promise<void>((resolve) => {
      finishTermination = resolve;
    });
    harness.job.kill();
    harness.job.kill();
    harness.child.emit("close", 1, null);
    await flushPromises();

    assert.strictEqual(harness.terminateCalls, 1);
    assert.strictEqual(harness.finishEvents.length, 0);

    finishTermination();
    await flushPromises();
    assert.strictEqual(harness.finishEvents[0]?.status, "stopped");
  });

  it("reports a failed process-tree stop even when the process never exits", async () => {
    const harness = await createChildHarness({
      monitor: { description: "watch" },
    });
    harness.termination = Promise.reject(new Error("Access is denied."));
    harness.job.kill();
    await flushPromises();

    assert.strictEqual(harness.monitorEvents.at(-1)?.ended?.status, "failed");
    assert.match(
      harness.monitorEvents.at(-1)?.ended?.reason ?? "",
      /Access is denied/,
    );
    assert.strictEqual(harness.TerminalJob.get(harness.job.id), undefined);
  });

  it("marks a natural signal exit as failed", async () => {
    const harness = await createChildHarness();
    harness.child.emit("close", null, "SIGTERM");
    await flushPromises();

    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
    assert.strictEqual(harness.finishEvents[0]?.exitCode, 143);
    assert.match(harness.finishEvents[0]?.error ?? "", /signal SIGTERM/);
  });

  it("marks a spawn error as failed", async () => {
    const harness = await createChildHarness();
    harness.child.emit("error", new Error("spawn cmd.exe ENOENT"));
    await flushPromises();

    assert.strictEqual(harness.finishEvents[0]?.status, "failed");
    assert.match(
      harness.finishEvents[0]?.error ?? "",
      /Command execution failed: spawn cmd.exe ENOENT/,
    );
  });

  it("applies backpressure to the child pipes while output is queued", async () => {
    const harness = await createChildHarness();
    const chunk = Buffer.from("x".repeat(600 * 1024));

    harness.child.stdout.emit("data", chunk);
    harness.child.stdout.emit("data", chunk);
    assert.strictEqual(harness.child.stdout.isPaused(), true);
    assert.strictEqual(harness.child.stderr.isPaused(), true);

    await flushPromises();
    assert.strictEqual(harness.child.stdout.isPaused(), false);
    assert.strictEqual(harness.child.stderr.isPaused(), false);

    harness.child.emit("close", 0, null);
    await flushPromises();
  });
});
