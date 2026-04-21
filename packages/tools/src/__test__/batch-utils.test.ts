import { describe, expect, it, vi } from "vitest";
import {
  BatchExecutionError,
  executePartitionedToolCalls,
  getToolCallBatchMode,
  isSafeToBatchToolCall,
  partitionToolCalls,
  runConcurrentBatch,
  type ToolBatchMode,
} from "../utils/batch-utils";

describe("BatchExecutionError", () => {
  it("has the correct name", () => {
    const err = new BatchExecutionError("msg", undefined, []);
    expect(err.name).toBe("BatchExecutionError");
  });

  it("stores message, cause, and pendingItems", () => {
    const cause = new Error("underlying");
    const pending = [1, 2, 3];
    const err = new BatchExecutionError("batch failed", cause, pending);

    expect(err.message).toBe("batch failed");
    expect(err.cause).toBe(cause);
    expect(err.pendingItems).toBe(pending);
  });

  it("is instanceof Error", () => {
    expect(new BatchExecutionError("", null, [])).toBeInstanceOf(Error);
  });
});

describe("isSafeToBatchToolCall", () => {
  it("returns true for readonly tool (readFile)", () => {
    expect(isSafeToBatchToolCall("readFile", {})).toBe(true);
  });

  it("returns true for newTask with runAsync: true", () => {
    expect(isSafeToBatchToolCall("newTask", { runAsync: true })).toBe(true);
  });

  it("returns false for newTask without runAsync", () => {
    expect(isSafeToBatchToolCall("newTask", { agentType: "default" })).toBe(
      false,
    );
  });

  it("returns true for startBackgroundJob", () => {
    expect(isSafeToBatchToolCall("startBackgroundJob", {})).toBe(true);
  });

  it("returns false for writeToFile", () => {
    expect(isSafeToBatchToolCall("writeToFile", {})).toBe(false);
  });

  it("returns false for applyDiff", () => {
    expect(isSafeToBatchToolCall("applyDiff", {})).toBe(false);
  });
});

describe("getToolCallBatchMode", () => {
  it("returns 'concurrent' for a readonly tool", () => {
    expect(getToolCallBatchMode("readFile", {})).toBe("concurrent");
  });

  it("returns 'serial' for a stateful tool", () => {
    expect(getToolCallBatchMode("writeToFile", {})).toBe("serial");
  });

  it("returns 'concurrent' for newTask with runAsync: true", () => {
    expect(getToolCallBatchMode("newTask", { runAsync: true })).toBe(
      "concurrent",
    );
  });
});

type SimpleItem = { toolName: string; input: unknown };

const getToolCall = (item: SimpleItem) => ({
  toolName: item.toolName,
  input: item.input,
});

function item(toolName: string, input: unknown = {}): SimpleItem {
  return { toolName, input };
}

describe("partitionToolCalls", () => {
  it("returns empty array for empty input", () => {
    expect(partitionToolCalls([], getToolCall)).toEqual([]);
  });

  it("groups all consecutive concurrent-safe calls into one batch", () => {
    const items = [item("readFile"), item("listFiles"), item("globFiles")];
    const batches = partitionToolCalls(items, getToolCall);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.mode).toBe("concurrent");
    expect(batches[0]?.items).toHaveLength(3);
  });

  it("puts each serial (stateful) call in its own batch", () => {
    const items = [item("writeToFile"), item("applyDiff")];
    const batches = partitionToolCalls(items, getToolCall);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.mode).toBe("serial");
    expect(batches[0]?.items).toEqual([items[0]]);
    expect(batches[1]?.mode).toBe("serial");
    expect(batches[1]?.items).toEqual([items[1]]);
  });

  it("flushes the concurrent batch before a serial barrier", () => {
    const items = [
      item("readFile"),
      item("readFile"),
      item("writeToFile"),
    ];
    const batches = partitionToolCalls(items, getToolCall);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.mode).toBe("concurrent");
    expect(batches[0]?.items).toHaveLength(2);
    expect(batches[1]?.mode).toBe("serial");
    expect(batches[1]?.items).toHaveLength(1);
  });

  it("starts a new concurrent batch after a serial barrier", () => {
    const items = [
      item("writeToFile"),
      item("readFile"),
      item("listFiles"),
    ];
    const batches = partitionToolCalls(items, getToolCall);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.mode).toBe("serial");
    expect(batches[1]?.mode).toBe("concurrent");
    expect(batches[1]?.items).toHaveLength(2);
  });

  it("correctly sequences concurrent → serial → concurrent", () => {
    const items = [
      item("readFile"),
      item("writeToFile"),
      item("listFiles"),
    ];
    const batches = partitionToolCalls(items, getToolCall);

    expect(batches).toHaveLength(3);
    expect(batches[0]?.mode).toBe("concurrent");
    expect(batches[0]?.items).toHaveLength(1);
    expect(batches[1]?.mode).toBe("serial");
    expect(batches[1]?.items).toHaveLength(1);
    expect(batches[2]?.mode).toBe("concurrent");
    expect(batches[2]?.items).toHaveLength(1);
  });

  it("handles a single concurrent item", () => {
    const batches = partitionToolCalls([item("readFile")], getToolCall);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.mode).toBe("concurrent");
    expect(batches[0]?.items).toHaveLength(1);
  });

  it("handles a single serial item", () => {
    const batches = partitionToolCalls([item("writeToFile")], getToolCall);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.mode).toBe("serial");
    expect(batches[0]?.items).toHaveLength(1);
  });

  it("preserves item identity (same references, not copies)", () => {
    const a = item("readFile");
    const b = item("writeToFile");
    const batches = partitionToolCalls([a, b], getToolCall);

    expect(batches[0]?.items[0]).toBe(a);
    expect(batches[1]?.items[0]).toBe(b);
  });
});

describe("executePartitionedToolCalls", () => {
  it("resolves without executing anything for empty batches", async () => {
    const execute = vi.fn();
    await expect(
      executePartitionedToolCalls([], execute, { concurrencyLimit: 1 }),
    ).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes a single serial item", async () => {
    const executed: string[] = [];
    const items = [item("writeToFile")];
    const batches = partitionToolCalls(items, getToolCall);

    await executePartitionedToolCalls(
      batches,
      async (it) => {
        executed.push((it as SimpleItem).toolName);
      },
      { concurrencyLimit: 1 },
    );

    expect(executed).toEqual(["writeToFile"]);
  });

  it("executes all concurrent items in a single batch", async () => {
    const executed: string[] = [];
    const items = [
      item("readFile"),
      item("listFiles"),
      item("globFiles"),
    ];
    const batches = partitionToolCalls(items, getToolCall);

    await executePartitionedToolCalls(
      batches,
      async (it) => {
        executed.push((it as SimpleItem).toolName);
      },
      { concurrencyLimit: 10 },
    );

    expect(executed).toHaveLength(3);
    expect(executed).toContain("readFile");
    expect(executed).toContain("listFiles");
    expect(executed).toContain("globFiles");
  });

  it("serial batch executes items sequentially (not overlapping)", async () => {
    const order: string[] = [];
    const log = (id: string) => async () => {
      order.push(`start:${id}`);
      await Promise.resolve(); // yield one microtask
      order.push(`end:${id}`);
    };

    const items = [item("writeToFile"), item("applyDiff")];
    const batches = partitionToolCalls(items, getToolCall);

    await executePartitionedToolCalls(
      batches,
      async (it) => {
        await log((it as SimpleItem).toolName)();
      },
      { concurrencyLimit: 5 },
    );

    // serial means end of item-1 before start of item-2
    expect(order.indexOf("end:writeToFile")).toBeLessThan(
      order.indexOf("start:applyDiff"),
    );
  });

  it("throws BatchExecutionError with pending items when a serial item fails", async () => {
    const items = [
      { ...item("writeToFile"), id: "a" },
      { ...item("applyDiff"), id: "b" },
      { ...item("writeToFile"), id: "c" },
    ] as (SimpleItem & { id: string })[];

    const batches = partitionToolCalls(
      items,
      (it) => ({ toolName: it.toolName, input: it.input }),
    );

    let caught: unknown;
    try {
      await executePartitionedToolCalls(
        batches,
        async (it) => {
          if ((it as (typeof items)[number]).id === "a") {
            throw new Error("item a failed");
          }
        },
        { concurrencyLimit: 1 },
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BatchExecutionError);
    const err = caught as BatchExecutionError<unknown>;
    expect(err.pendingItems).toEqual([items[1], items[2]]);
  });

  it("includes items from later batches in pendingItems when an earlier batch fails", async () => {
    // 2 serial items (each in own batch) followed by a concurrent batch
    const items = [
      { toolName: "writeToFile", input: {}, id: "a" },
      { toolName: "applyDiff", input: {}, id: "b" },
      { toolName: "readFile", input: {}, id: "c" },
    ] as { toolName: string; input: unknown; id: string }[];

    const batches = partitionToolCalls(
      items,
      (it) => ({ toolName: it.toolName, input: it.input }),
    );

    let caught: unknown;
    try {
      await executePartitionedToolCalls(
        batches,
        async (it) => {
          if ((it as (typeof items)[number]).id === "a") {
            throw new Error("first item failed");
          }
        },
        { concurrencyLimit: 5 },
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BatchExecutionError);
    const err = caught as BatchExecutionError<unknown>;
    expect(err.pendingItems).toEqual([items[1], items[2]]);
  });

  it("respects concurrencyLimit when running a concurrent batch", async () => {
    const items = [
      item("readFile"),
      item("listFiles"),
      item("globFiles"),
      item("readFile"),
      item("listFiles"),
      item("globFiles"),
    ];
    const batches = partitionToolCalls(items, getToolCall);

    let active = 0;
    let maxActive = 0;
    let executeCount = 0;

    await executePartitionedToolCalls(
      batches,
      async (_it, batchMode) => {
        expect(batchMode).toBe("concurrent");
        executeCount++;
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        active--;
      },
      { concurrencyLimit: 2 },
    );

    expect(executeCount).toBe(items.length);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("runs a single concurrent item through the concurrent path", async () => {
    const batches = partitionToolCalls([item("readFile")], getToolCall);
    const seenModes: ToolBatchMode[] = [];

    await executePartitionedToolCalls(
      batches,
      async (_it, batchMode) => {
        seenModes.push(batchMode);
      },
      { concurrencyLimit: 1 },
    );

    expect(seenModes).toEqual(["concurrent"]);
  });

  it("continues to later batches when a concurrent batch item fails", async () => {
    const items = [
      item("readFile"),
      item("listFiles"),
      item("writeToFile"),
    ];
    const batches = partitionToolCalls(items, getToolCall);
    const executed: string[] = [];

    await executePartitionedToolCalls(
      batches,
      async (it) => {
        executed.push((it as SimpleItem).toolName);
        if ((it as SimpleItem).toolName === "readFile") {
          throw new Error("concurrent failed");
        }
      },
      { concurrencyLimit: 2 },
    );

    expect(executed).toContain("readFile");
    expect(executed).toContain("listFiles");
    expect(executed).toContain("writeToFile");
  });
});

describe("runConcurrentBatch", () => {
  it("runs all items with batchMode='concurrent'", async () => {
    const items = [1, 2, 3, 4];
    const seen: number[] = [];
    const modes: string[] = [];

    await runConcurrentBatch(items, 3, async (it, mode) => {
      seen.push(it as number);
      modes.push(mode);
    });

    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(modes.every((m) => m === "concurrent")).toBe(true);
  });

  it("never exceeds the configured concurrency", async () => {
    const items = Array.from({ length: 8 }, (_, i) => i + 1);
    let active = 0;
    let maxActive = 0;

    await runConcurrentBatch(items, 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      active--;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("rejects when execute throws", async () => {
    await expect(
      runConcurrentBatch(["a", "b"], 2, async (it) => {
        if (it === "a") {
          throw new Error("boom");
        }
      }),
    ).rejects.toThrow("boom");
  });

  it("keeps processing remaining items before rejecting", async () => {
    const seen: string[] = [];

    await expect(
      runConcurrentBatch(
        ["a", "b", "c"],
        2,
        async (it) => {
          seen.push(it as string);
          if (it === "a") {
            throw new Error("boom");
          }
        },
      ),
    ).rejects.toThrow("boom");

    expect(seen).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("still runs items when concurrencyLimit is 0", async () => {
    const seen: number[] = [];

    await runConcurrentBatch([1], 0, async (it) => {
      seen.push(it as number);
    });

    expect(seen).toEqual([1]);
  });
});
