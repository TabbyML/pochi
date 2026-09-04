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

function createHarness(kill = sinon.stub()) {
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
  const { PtyProcess } = proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../pty-process", {
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
  ) => import("../pty-process").PtyProcess;
  const ptyProcess = new ProcessConstructor(fakePty);
  return {
    data: (chunk: string) => dataListener?.(chunk),
    exit: (exitCode: number) => exitListener?.({ exitCode }),
    kill,
    ptyProcess,
  };
}

describe("PtyProcess", () => {
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
