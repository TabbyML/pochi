import * as assert from "node:assert";
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

function createHarness() {
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
    async *read() {},
  };
  const shellIntegration: FakeShellIntegration = {
    executeCommand: () => execution,
  };
  const terminal: FakeTerminal = {
    shellIntegration,
    show: () => {},
    dispose: () => closeEmitter.fire(terminal),
  };
  const finalizeCalls: Array<TestExecutionError | undefined> = [];
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
  });

  return {
    TerminalJob,
    closeEmitter,
    execution,
    executionEndEmitter,
    finalizeCalls,
    job,
    terminal,
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
  it("keeps a completed job registered until its terminal closes", async () => {
    const {
      TerminalJob,
      execution,
      executionEndEmitter,
      finalizeCalls,
      job,
      terminal,
    } = createHarness();

    await flushPromises();
    executionEndEmitter.fire({ execution, exitCode: 0 });
    await flushPromises();

    assert.strictEqual(finalizeCalls.length, 1);
    assert.strictEqual(finalizeCalls[0], undefined);
    assert.strictEqual(TerminalJob.get(job.id), job);

    terminal.dispose();
    await flushPromises();

    assert.strictEqual(TerminalJob.get(job.id), undefined);
    assert.strictEqual(finalizeCalls.length, 1);
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
});
