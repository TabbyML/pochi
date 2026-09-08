import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";

interface FakePty {
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  kill(signal?: string): void;
}

function createHarness(kill = sinon.stub(), launchNonce?: string) {
  let dataListener: ((data: string) => void) | undefined;
  let exitListener: ((event: { exitCode: number }) => void) | undefined;
  const fakePty: FakePty = {
    onData: (listener) => {
      dataListener = listener;
    },
    onExit: (listener) => {
      exitListener = listener;
    },
    write: sinon.stub(),
    resize: sinon.stub(),
    kill,
  };
  const spawn = sinon.stub().returns(fakePty);
  const { PtyProcess } = proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../pty-process", {
      "node:module": { createRequire: () => () => ({ spawn }) },
      vscode: {
        env: { appRoot: "/app" },
        Uri: {
          file: (path: string) => ({ path, toString: () => path }),
          joinPath: (base: { path: string }, ...paths: string[]) => ({
            toString: () => [base.path, ...paths].join("/"),
          }),
        },
      },
      "@getpochi/common": {
        getLogger: () => ({
          debug: sinon.stub(),
          warn: sinon.stub(),
        }),
      },
    }) as typeof import("../pty-process");
  const ProcessConstructor = PtyProcess as unknown as new (
    process: FakePty,
    launchNonce?: string,
  ) => import("../pty-process").PtyProcess;
  const ptyProcess = new ProcessConstructor(fakePty, launchNonce);
  return {
    data: (chunk: string) => dataListener?.(chunk),
    exit: (exitCode: number) => exitListener?.({ exitCode }),
    kill,
    ptyProcess,
    spawn,
    spawnProcess: PtyProcess.spawn,
  };
}

const LaunchNonce = "0123456789abcdef";
const LaunchMarker = `\u001b]6339;${LaunchNonce}\u0007`;

describe("PtyProcess", () => {
  it("does not spawn an already cancelled command", async () => {
    const harness = createHarness();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      harness.spawnProcess({
        command: "echo hello",
        cwd: "/tmp",
        abortSignal: controller.signal,
      }),
      { name: "ExecutionError", aborted: true },
    );
    assert.strictEqual(harness.spawn.callCount, 0);
  });

  it("kills immediately during launch and rejects cancellation without a spawn error", async () => {
    const clock = sinon.useFakeTimers();
    const originalShell = process.env.SHELL;
    process.env.SHELL = "/bin/bash";
    try {
      const harness = createHarness();
      const controller = new AbortController();
      const removeListener = sinon.spy(
        controller.signal,
        "removeEventListener",
      );
      const launched = harness.spawnProcess({
        command: "echo hello",
        cwd: "/tmp",
        abortSignal: controller.signal,
      });
      const rejected = assert.rejects(launched, {
        name: "ExecutionError",
        aborted: true,
      });
      // Exercise synchronous exit delivery during kill as well as cancellation.
      harness.kill.callsFake(() => harness.exit(143));
      controller.abort();
      assert.deepStrictEqual(harness.kill.args, [["SIGTERM"]]);
      await rejected;
      assert.ok(removeListener.calledOnce);
      await clock.tickAsync(3_000);
      assert.strictEqual(harness.kill.callCount, 1);
    } finally {
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
      clock.restore();
    }
  });

  it("reports exit after node-pty delivers output preceding socket close", () => {
    const harness = createHarness();
    const events: string[] = [];
    harness.ptyProcess.onData((data: string) => events.push(`data:${data}`));
    harness.ptyProcess.onExit(({ exitCode }: { exitCode: number }) =>
      events.push(`exit:${exitCode}`),
    );

    harness.data("trailing output\n");
    harness.exit(0);

    assert.deepStrictEqual(events, ["data:trailing output\n", "exit:0"]);
  });

  it("bounds replay history while retaining the latest output", () => {
    const harness = createHarness();
    harness.data("a".repeat(600_000));
    harness.data("b".repeat(600_000));

    const subscription = harness.ptyProcess.subscribeWithReplay(() => {});
    const replay = subscription.replay.join("");

    assert.strictEqual(replay.length, 1_000_000);
    assert.strictEqual(replay, `${"a".repeat(400_000)}${"b".repeat(600_000)}`);
    subscription.disposable.dispose();
  });

  it("allows late exit delivery to be cancelled", async () => {
    const harness = createHarness();
    const exits: number[] = [];
    harness.exit(0);
    const subscription = harness.ptyProcess.onExit(
      ({ exitCode }: { exitCode: number }) => exits.push(exitCode),
    );

    subscription.dispose();
    await Promise.resolve();
    assert.deepStrictEqual(exits, []);
  });

  it("escalates SIGTERM to SIGKILL after the grace period", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const harness = createHarness();
      harness.ptyProcess.kill();
      assert.deepStrictEqual(harness.kill.args, [["SIGTERM"]]);

      await clock.tickAsync(2_000);
      assert.deepStrictEqual(harness.kill.args, [["SIGTERM"], ["SIGKILL"]]);
      harness.exit(137);
    } finally {
      clock.restore();
    }
  });

  it("confirms the launch and hides the marker from the output stream", async () => {
    const harness = createHarness(sinon.stub(), LaunchNonce);
    const chunks: string[] = [];
    harness.ptyProcess.onData((data: string) => chunks.push(data));

    harness.data(`${LaunchMarker}hello world`);
    await harness.ptyProcess.waitForLaunch();

    assert.deepStrictEqual(chunks, ["hello world"]);
    const subscription = harness.ptyProcess.subscribeWithReplay(() => {});
    assert.deepStrictEqual(subscription.replay, ["hello world"]);
    subscription.disposable.dispose();
  });

  it("confirms the launch when the marker is split across chunks", async () => {
    const harness = createHarness(sinon.stub(), LaunchNonce);
    const chunks: string[] = [];
    harness.ptyProcess.onData((data: string) => chunks.push(data));

    harness.data(LaunchMarker.slice(0, 5));
    harness.data(`${LaunchMarker.slice(5)}hi`);
    await harness.ptyProcess.waitForLaunch();

    assert.deepStrictEqual(chunks, ["hi"]);
  });

  it("fails the launch when the shell exits before emitting the marker", async () => {
    const harness = createHarness(sinon.stub(), LaunchNonce);
    const launched = harness.ptyProcess.waitForLaunch();

    harness.data("zsh: command not found: zsh\n");
    harness.exit(127);

    await assert.rejects(launched, (error: Error) => {
      assert.strictEqual(error.name, "PtySpawnError");
      assert.match(error.message, /exited before confirming launch/);
      assert.match(String(error.cause), /command not found/);
      return true;
    });
  });

  it("assumes the launch succeeded once the confirmation timeout elapses", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const harness = createHarness(sinon.stub(), LaunchNonce);
      const chunks: string[] = [];
      harness.ptyProcess.onData((data: string) => chunks.push(data));
      const launched = harness.ptyProcess.waitForLaunch();

      harness.data("password:");
      assert.deepStrictEqual(chunks, ["password:"]);

      await clock.tickAsync(1_000);
      await launched;
      assert.deepStrictEqual(chunks, ["password:"]);

      harness.data(" ok");
      assert.deepStrictEqual(chunks, ["password:", " ok"]);
    } finally {
      clock.restore();
    }
  });

  it("confirms a quick exit after more than 64 KiB of startup output", async () => {
    const harness = createHarness(sinon.stub(), LaunchNonce);
    const launched = harness.ptyProcess.waitForLaunch();
    const startupChunk = "x".repeat(4096);
    for (let index = 0; index < 17; index++) harness.data(startupChunk);
    harness.data(LaunchMarker.slice(0, 5));
    harness.data(`${LaunchMarker.slice(5)}command completed`);
    harness.exit(0);

    await launched;
    const subscription = harness.ptyProcess.subscribeWithReplay(() => {});
    assert.strictEqual(
      subscription.replay.join(""),
      `${startupChunk.repeat(17)}command completed`,
    );
    subscription.disposable.dispose();
  });

  for (const startsBeforeTimeout of [false, true]) {
    it(`strips a split marker starting ${startsBeforeTimeout ? "before" : "after"} the launch timeout`, async () => {
      const clock = sinon.useFakeTimers();
      try {
        const harness = createHarness(sinon.stub(), LaunchNonce);
        const chunks: string[] = [];
        harness.ptyProcess.onData((data: string) => chunks.push(data));
        const launched = harness.ptyProcess.waitForLaunch();
        harness.data("startup output");
        if (startsBeforeTimeout) harness.data(LaunchMarker.slice(0, 5));

        await clock.tickAsync(1_000);
        await launched;
        assert.deepStrictEqual(chunks, ["startup output"]);

        if (!startsBeforeTimeout) harness.data(LaunchMarker.slice(0, 5));
        harness.data(`${LaunchMarker.slice(5)}command output`);
        harness.exit(0);
        assert.deepStrictEqual(chunks, ["startup output", "command output"]);
        const subscription = harness.ptyProcess.subscribeWithReplay(() => {});
        assert.deepStrictEqual(subscription.replay, chunks);
        subscription.disposable.dispose();
      } finally {
        clock.restore();
      }
    });
  }

  it("flushes an incomplete marker before reporting exit after timeout", async () => {
    const clock = sinon.useFakeTimers();
    try {
      const harness = createHarness(sinon.stub(), LaunchNonce);
      const events: string[] = [];
      harness.ptyProcess.onData((data: string) => events.push(data));
      harness.ptyProcess.onExit(() => events.push("exit"));
      const launched = harness.ptyProcess.waitForLaunch();
      const partialMarker = LaunchMarker.slice(0, 5);
      harness.data(partialMarker);
      await clock.tickAsync(1_000);
      await launched;
      assert.deepStrictEqual(events, []);

      harness.exit(0);
      assert.deepStrictEqual(events, [partialMarker, "exit"]);
    } finally {
      clock.restore();
    }
  });

  it("catches kill races and allows a repeated stop to hard-kill", () => {
    const kill = sinon.stub();
    kill.onFirstCall().throws(new Error("already exited"));
    const harness = createHarness(kill);

    assert.doesNotThrow(() => harness.ptyProcess.kill());
    assert.doesNotThrow(() => harness.ptyProcess.kill());
    assert.deepStrictEqual(kill.args, [["SIGTERM"], ["SIGKILL"]]);
    harness.exit(137);
  });
});
