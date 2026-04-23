import { type Mock, describe, expect, it, vi } from "vitest";
import {
  BatchExecuteManager,
} from "../batch-execute-manager";
import { type BatchedToolCallResult, type ToolCallCancelReason, type BatchedToolCall, ToolCallQueue } from "@getpochi/tools";

let _callIdCounter = 0;
function makeCall(
  toolName: string,
  result: BatchedToolCallResult = { kind: "success" },
): {
  call: BatchedToolCall;
  run: Mock<() => Promise<BatchedToolCallResult>>;
  cancel: Mock<(reason: ToolCallCancelReason) => void>;
} {
  const run = vi
    .fn<() => Promise<BatchedToolCallResult>>()
    .mockResolvedValue(result);
  const cancel = vi.fn<(reason: ToolCallCancelReason) => void>();
  return {
    call: {
      type: `tool-${toolName}` as `tool-${string}`,
      toolCallId: `tc-${++_callIdCounter}`,
      input: {},
      state: "input-available",
      run,
      cancel,
    },
    run,
    cancel,
  };
}

describe("BatchExecuteManager – basic flow", () => {
  it("runs a single enqueued item when processQueue is called", async () => {
    const manager = new BatchExecuteManager();
    const { call, run } = makeCall("readFile");

    manager.enqueue("task1", call);
    manager.processQueue("task1");

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
  });

  it("runs multiple items for the same taskId", async () => {
    const manager = new BatchExecuteManager();
    const a = makeCall("readFile");
    const b = makeCall("listFiles");
    const c = makeCall("writeToFile");

    manager.enqueue("task1", a.call);
    manager.enqueue("task1", b.call);
    manager.enqueue("task1", c.call);
    manager.processQueue("task1");

    await vi.waitFor(() => {
      expect(a.run).toHaveBeenCalledOnce();
      expect(b.run).toHaveBeenCalledOnce();
      expect(c.run).toHaveBeenCalledOnce();
    });
  });

  it("does nothing when processQueue is called on an empty queue", async () => {
    const manager = new BatchExecuteManager();
    // Should not throw
    manager.processQueue("task1");
  });

  it("items enqueued after processAll completes require an explicit new processQueue call", async () => {
    const manager = new BatchExecuteManager();

    const first = makeCall("readFile");

    manager.enqueue("task1", first.call);
    manager.processQueue("task1");

    // setTimeout(0) fires only after all pending microtasks, which guarantees
    // processAll's `finally { this.processing = false }` has run before we
    // attempt a second processQueue call.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(first.run).toHaveBeenCalledOnce();

    // Enqueue a second item now that the queue is idle.
    const second = makeCall("listFiles");
    manager.enqueue("task1", second.call);

    // Without a new processQueue call the second item stays queued.
    expect(second.run).not.toHaveBeenCalled();

    // An explicit processQueue picks up the second item.
    manager.processQueue("task1");
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(second.run).toHaveBeenCalledOnce();
  });
});

describe("BatchExecuteManager – stateful tool error stops queue", () => {
  it("cancels remaining items with 'previous-tool-call-failed' when a stateful item errors", async () => {
    const manager = new BatchExecuteManager();

    const failing = makeCall("writeToFile", {
      kind: "error",
      error: "write failed",
    });
    const pending1 = makeCall("readFile");
    const pending2 = makeCall("listFiles");

    manager.enqueue("task1", failing.call);
    manager.enqueue("task1", pending1.call);
    manager.enqueue("task1", pending2.call);
    manager.processQueue("task1");

    await vi.waitFor(() => {
      expect(pending1.cancel).toHaveBeenCalledWith("previous-tool-call-failed");
      expect(pending2.cancel).toHaveBeenCalledWith("previous-tool-call-failed");
    });

    // The failing item still ran
    expect(failing.run).toHaveBeenCalledOnce();
    // The cancelled items were never run
    expect(pending1.run).not.toHaveBeenCalled();
    expect(pending2.run).not.toHaveBeenCalled();
  });

});

describe("BatchExecuteManager – readonly tool error does NOT stop queue", () => {
  it("continues running remaining items when a readonly tool returns an error", async () => {
    const manager = new BatchExecuteManager();

    const erroring = makeCall("readFile", {
      kind: "error",
      error: "read failed",
    });
    const next = makeCall("listFiles");

    manager.enqueue("task1", erroring.call);
    manager.enqueue("task1", next.call);
    manager.processQueue("task1");

    await vi.waitFor(() => {
      expect(erroring.run).toHaveBeenCalledOnce();
      expect(next.run).toHaveBeenCalledOnce();
    });

    expect(next.cancel).not.toHaveBeenCalled();
  });

});

describe("BatchExecuteManager – abort", () => {
  it("cancels all pending items with 'user-abort' before processQueue", () => {
    const manager = new BatchExecuteManager();

    const a = makeCall("writeToFile");
    const b = makeCall("readFile");

    manager.enqueue("task1", a.call);
    manager.enqueue("task1", b.call);

    // Abort before starting
    manager.abort("task1");

    expect(a.cancel).toHaveBeenCalledWith("user-abort");
    expect(b.cancel).toHaveBeenCalledWith("user-abort");
  });

  it("items aborted before processQueue are not run", async () => {
    const manager = new BatchExecuteManager();

    const a = makeCall("writeToFile");
    const b = makeCall("readFile");

    manager.enqueue("task1", a.call);
    manager.enqueue("task1", b.call);
    manager.abort("task1");
    manager.processQueue("task1");

    // Give microtasks a chance to run
    await Promise.resolve();

    expect(a.run).not.toHaveBeenCalled();
    expect(b.run).not.toHaveBeenCalled();
  });

  it("abort with default reason uses 'user-abort'", () => {
    const manager = new BatchExecuteManager();
    const a = makeCall("writeToFile");

    manager.enqueue("task1", a.call);
    manager.abort("task1"); // no explicit reason → defaults to "user-abort"

    expect(a.cancel).toHaveBeenCalledWith("user-abort");
  });
});

describe("BatchExecuteManager – taskId isolation", () => {
  it("keeps queues for different taskIds completely separate", async () => {
    const manager = new BatchExecuteManager();

    const task1Item = makeCall("readFile");
    const task2Item = makeCall("listFiles");

    manager.enqueue("task1", task1Item.call);
    manager.enqueue("task2", task2Item.call);

    manager.processQueue("task1");
    manager.processQueue("task2");

    await vi.waitFor(() => {
      expect(task1Item.run).toHaveBeenCalledOnce();
      expect(task2Item.run).toHaveBeenCalledOnce();
    });
  });

  it("an error in task1 does not affect task2 items", async () => {
    const manager = new BatchExecuteManager();

    const task1Failing = makeCall("writeToFile", {
      kind: "error",
      error: "task1 failed",
    });
    const task1Victim = makeCall("readFile");
    const task2Item = makeCall("listFiles");

    manager.enqueue("task1", task1Failing.call);
    manager.enqueue("task1", task1Victim.call);
    manager.enqueue("task2", task2Item.call);

    manager.processQueue("task1");
    manager.processQueue("task2");

    await vi.waitFor(() => {
      // task1's second item is cancelled
      expect(task1Victim.cancel).toHaveBeenCalledWith(
        "previous-tool-call-failed",
      );
      // task2's item runs successfully
      expect(task2Item.run).toHaveBeenCalledOnce();
    });

    expect(task2Item.cancel).not.toHaveBeenCalled();
  });

  it("abort for task1 does not affect task2 items", () => {
    const manager = new BatchExecuteManager();

    const task1Item = makeCall("writeToFile");
    const task2Item = makeCall("readFile");

    manager.enqueue("task1", task1Item.call);
    manager.enqueue("task2", task2Item.call);

    manager.abort("task1");

    expect(task1Item.cancel).toHaveBeenCalledWith("user-abort");
    expect(task2Item.cancel).not.toHaveBeenCalled();
  });
});

describe("BatchExecuteManager – re-entrancy guard", () => {
  it("calling processQueue again while already processing is a no-op", async () => {
    const manager = new BatchExecuteManager();

    let resolveFirst!: () => void;
    const slowRun = vi.fn<() => Promise<BatchedToolCallResult>>(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ kind: "success" });
        }),
    );

    const slowCall: BatchedToolCall = {
      type: "tool-writeToFile",
      toolCallId: `tc-${++_callIdCounter}`,
      input: {},
      state: "input-available",
      run: slowRun,
      cancel: vi.fn(),
    };

    manager.enqueue("task1", slowCall);
    manager.processQueue("task1");
    // Second call while first is still in flight
    manager.processQueue("task1");

    // Only one invocation of the slow run
    expect(slowRun).toHaveBeenCalledTimes(1);

    resolveFirst();
    await vi.waitFor(() => expect(slowRun).toHaveBeenCalledTimes(1));
  });
});

describe("ToolCallQueue", () => {
  it("abort before flush cancels queued items without running them", async () => {
    const queue = new ToolCallQueue();
    const a = makeCall("readFile");
    const b = makeCall("writeToFile");

    queue.enqueue(a.call);
    queue.enqueue(b.call);
    queue.abort("user-abort");
    queue.start();

    await Promise.resolve();

    expect(a.cancel).toHaveBeenCalledWith("user-abort");
    expect(b.cancel).toHaveBeenCalledWith("user-abort");
    expect(a.run).not.toHaveBeenCalled();
    expect(b.run).not.toHaveBeenCalled();
  });

});
