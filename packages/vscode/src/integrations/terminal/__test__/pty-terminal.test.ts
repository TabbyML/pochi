import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";

class TestEventEmitter<T> {
  private readonly listeners = new Set<(event: T) => void>();
  readonly event = (listener: (event: T) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: T): void {
    for (const listener of [...this.listeners]) listener(event);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

describe("PtyTerminal", () => {
  it("replays output and forwards input and dimensions", () => {
    let dataListener: ((data: string) => void) | undefined;
    let exitListener: ((event: { exitCode: number }) => void) | undefined;
    const ptyProcess = {
      subscribeWithReplay: (listener: (data: string) => void) => {
        dataListener = listener;
        return {
          replay: ["before timeout\n"],
          disposable: { dispose: sinon.stub() },
        };
      },
      onExit: (listener: (event: { exitCode: number }) => void) => {
        exitListener = listener;
        return { dispose: sinon.stub() };
      },
      write: sinon.stub(),
      resize: sinon.stub(),
    };
    const onCloseRequested = sinon.stub();
    const { PtyTerminal } = proxyquire
      .noCallThru()
      .noPreserveCache()
      .load("../pty-terminal", {
        vscode: { EventEmitter: TestEventEmitter },
      }) as typeof import("../pty-terminal");
    const terminal = new PtyTerminal(ptyProcess as never, onCloseRequested);
    const output: string[] = [];
    const exits: Array<number | void> = [];
    terminal.onDidWrite((data) => output.push(data));
    terminal.onDidClose((exitCode) => exits.push(exitCode));

    dataListener?.("while opening\n");
    terminal.open();
    dataListener?.("after opening\n");
    terminal.handleInput("hello\r");
    terminal.setDimensions({ columns: 120, rows: 40 });
    exitListener?.({ exitCode: 0 });
    terminal.close();

    assert.deepStrictEqual(output, [
      "before timeout\n",
      "while opening\n",
      "after opening\n",
    ]);
    assert.ok(ptyProcess.write.calledOnceWithExactly("hello\r"));
    assert.ok(ptyProcess.resize.calledOnceWithExactly(120, 40));
    assert.deepStrictEqual(exits, [0]);
    assert.strictEqual(onCloseRequested.callCount, 0);
  });

  it("detaches without stopping the underlying process", () => {
    const onCloseRequested = sinon.stub();
    const dataSubscription = { dispose: sinon.stub() };
    const exitSubscription = { dispose: sinon.stub() };
    const ptyProcess = {
      subscribeWithReplay: () => ({
        replay: [],
        disposable: dataSubscription,
      }),
      onExit: () => exitSubscription,
      write: sinon.stub(),
      resize: sinon.stub(),
      kill: sinon.stub(),
    };
    const { PtyTerminal } = proxyquire
      .noCallThru()
      .noPreserveCache()
      .load("../pty-terminal", {
        vscode: { EventEmitter: TestEventEmitter },
      }) as typeof import("../pty-terminal");

    new PtyTerminal(ptyProcess as never, onCloseRequested).close();

    assert.strictEqual(onCloseRequested.callCount, 1);
    assert.strictEqual(ptyProcess.kill.callCount, 0);
    assert.strictEqual(dataSubscription.dispose.callCount, 1);
    assert.strictEqual(exitSubscription.dispose.callCount, 1);
  });
});
