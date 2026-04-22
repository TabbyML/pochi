import { describe, expect, it, vi } from "vitest";
import {
  BatchExecutionError,
  executeToolCalls,
  isSafeToBatchToolCall,
  partitionToolCalls,
  runConcurrentBatch,
  type BatchedToolCall,
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

function item(toolName: string, input: unknown = {}): BatchedToolCall {
  return {
    toolName,
    input,
    run: async () => ({ kind: "success" }),
    cancel: () => {},
  };
}

describe("partitionToolCalls", () => {
  it("returns empty array for empty input", () => {
    expect(partitionToolCalls([])).toEqual([]);
  });

  it("groups all consecutive concurrent-safe calls into one batch", () => {
    const items = [item("readFile"), item("listFiles"), item("globFiles")];
    const batches = partitionToolCalls(items);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.isConcurrencySafe).toBe(true);
    expect(batches[0]?.items).toHaveLength(3);
  });

  it("puts each serial (stateful) call in its own batch", () => {
    const items = [item("writeToFile"), item("applyDiff")];
    const batches = partitionToolCalls(items);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.isConcurrencySafe).toBe(false);
    expect(batches[0]?.items).toEqual([items[0]]);
    expect(batches[1]?.isConcurrencySafe).toBe(false);
    expect(batches[1]?.items).toEqual([items[1]]);
  });

  it("flushes the concurrent batch before a serial barrier", () => {
    const items = [
      item("readFile"),
      item("readFile"),
      item("writeToFile"),
    ];
    const batches = partitionToolCalls(items);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.isConcurrencySafe).toBe(true);
    expect(batches[0]?.items).toHaveLength(2);
    expect(batches[1]?.isConcurrencySafe).toBe(false);
    expect(batches[1]?.items).toHaveLength(1);
  });

  it("starts a new concurrent batch after a serial barrier", () => {
    const items = [
      item("writeToFile"),
      item("readFile"),
      item("listFiles"),
    ];
    const batches = partitionToolCalls(items);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.isConcurrencySafe).toBe(false);
    expect(batches[1]?.isConcurrencySafe).toBe(true);
    expect(batches[1]?.items).toHaveLength(2);
  });

  it("correctly sequences concurrent → serial → concurrent", () => {
    const items = [
      item("readFile"),
      item("writeToFile"),
      item("listFiles"),
    ];
    const batches = partitionToolCalls(items);

    expect(batches).toHaveLength(3);
    expect(batches[0]?.isConcurrencySafe).toBe(true);
    expect(batches[0]?.items).toHaveLength(1);
    expect(batches[1]?.isConcurrencySafe).toBe(false);
    expect(batches[1]?.items).toHaveLength(1);
    expect(batches[2]?.isConcurrencySafe).toBe(true);
    expect(batches[2]?.items).toHaveLength(1);
  });

  it("handles a single concurrent item", () => {
    const batches = partitionToolCalls([item("readFile")]);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.isConcurrencySafe).toBe(true);
    expect(batches[0]?.items).toHaveLength(1);
  });

  it("handles a single serial item", () => {
    const batches = partitionToolCalls([item("writeToFile")]);

    expect(batches).toHaveLength(1);
    expect(batches[0]?.isConcurrencySafe).toBe(false);
    expect(batches[0]?.items).toHaveLength(1);
  });

  it("preserves item identity (same references, not copies)", () => {
    const a = item("readFile");
    const b = item("writeToFile");
    const batches = partitionToolCalls([a, b]);

    expect(batches[0]?.items[0]).toBe(a);
    expect(batches[1]?.items[0]).toBe(b);
  });
});

describe("executeToolCalls", () => {
  it("resolves without executing anything for empty items", async () => {
    await expect(executeToolCalls({ toolCalls: [] })).resolves.toBeUndefined();
  });

  it("executes a single serial item", async () => {
    const executed: string[] = [];
    const items = [
      {
        ...item("writeToFile"),
        run: async () => {
          executed.push("writeToFile");
          return { kind: "success" as const };
        },
      },
    ];

    await executeToolCalls({ toolCalls: items });

    expect(executed).toEqual(["writeToFile"]);
  });

  it("executes all concurrent items in a single batch", async () => {
    const executed: string[] = [];
    const items = [
      {
        ...item("readFile"),
        run: async () => {
          executed.push("readFile");
          return { kind: "success" as const };
        },
      },
      {
        ...item("listFiles"),
        run: async () => {
          executed.push("listFiles");
          return { kind: "success" as const };
        },
      },
      {
        ...item("globFiles"),
        run: async () => {
          executed.push("globFiles");
          return { kind: "success" as const };
        },
      },
    ];

    await executeToolCalls({ toolCalls: items });

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
      return { kind: "success" as const };
    };

    const items = [
      { ...item("writeToFile"), run: log("writeToFile") },
      { ...item("applyDiff"), run: log("applyDiff") },
    ];

    await executeToolCalls({ toolCalls: items });

    // serial means end of item-1 before start of item-2
    expect(order.indexOf("end:writeToFile")).toBeLessThan(
      order.indexOf("start:applyDiff"),
    );
  });

  it("throws BatchExecutionError with pending items when a serial item fails", async () => {
    const items = [
      {
        ...item("writeToFile"),
        run: async () => {
          throw new Error("item a failed");
        },
      },
      item("applyDiff"),
      item("writeToFile"),
    ];

    let caught: unknown;
    try {
      await executeToolCalls({ toolCalls: items });
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
      {
        ...item("writeToFile"),
        run: async () => {
          throw new Error("first item failed");
        },
      },
      item("applyDiff"),
      item("readFile"),
    ];

    let caught: unknown;
    try {
      await executeToolCalls({ toolCalls: items });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BatchExecutionError);
    const err = caught as BatchExecutionError<unknown>;
    expect(err.pendingItems).toEqual([items[1], items[2]]);
  });

  it("runs all concurrent items and checks total execution count", async () => {
    let executeCount = 0;

    const runWithDelay = async () => {
      executeCount++;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return { kind: "success" as const };
    };

    const items = [
      { ...item("readFile"), run: runWithDelay },
      { ...item("listFiles"), run: runWithDelay },
      { ...item("globFiles"), run: runWithDelay },
      { ...item("readFile"), run: runWithDelay },
      { ...item("listFiles"), run: runWithDelay },
      { ...item("globFiles"), run: runWithDelay },
    ];

    await executeToolCalls({ toolCalls: items });

    expect(executeCount).toBe(items.length);
  });

  it("continues to later batches when a concurrent batch item fails", async () => {
    const executed: string[] = [];
    const items = [
      {
        ...item("readFile"),
        run: async () => {
          executed.push("readFile");
          throw new Error("concurrent failed");
        },
      },
      {
        ...item("listFiles"),
        run: async () => {
          executed.push("listFiles");
          return { kind: "success" as const };
        },
      },
      {
        ...item("writeToFile"),
        run: async () => {
          executed.push("writeToFile");
          return { kind: "success" as const };
        },
      },
    ];

    await executeToolCalls({ toolCalls: items });

    expect(executed).toContain("readFile");
    expect(executed).toContain("listFiles");
    expect(executed).toContain("writeToFile");
  });
});

describe("runConcurrentBatch", () => {
  it("runs all items with isConcurrencySafe=true", async () => {
    const seen: string[] = [];
    const items = [
      { ...item("1"), run: async () => { seen.push("1"); return { kind: "success" as const }; } },
      { ...item("2"), run: async () => { seen.push("2"); return { kind: "success" as const }; } },
      { ...item("3"), run: async () => { seen.push("3"); return { kind: "success" as const }; } },
      { ...item("4"), run: async () => { seen.push("4"); return { kind: "success" as const }; } },
    ];

    await runConcurrentBatch(items, { concurrencyLimit: 3 });

    expect(seen.sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("never exceeds the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    const runWithDelay = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      active--;
      return { kind: "success" as const };
    };

    const items = Array.from({ length: 8 }, (_, i) => ({
      ...item(String(i + 1)),
      run: runWithDelay,
    }));

    await runConcurrentBatch(items, { concurrencyLimit: 2 });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("does not reject when execute throws", async () => {
    const items = [
      { ...item("a"), run: async () => { throw new Error("boom"); } },
      item("b"),
    ];
    await expect(
      runConcurrentBatch(items, { concurrencyLimit: 2 }),
    ).resolves.toBeUndefined();
  });

  it("keeps processing remaining items despite errors", async () => {
    const seen: string[] = [];

    const items = [
      { ...item("a"), run: async () => { seen.push("a"); throw new Error("boom"); } },
      { ...item("b"), run: async () => { seen.push("b"); return { kind: "success" as const }; } },
      { ...item("c"), run: async () => { seen.push("c"); return { kind: "success" as const }; } },
    ];

    await runConcurrentBatch(items, { concurrencyLimit: 2 });

    expect(seen).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("still runs items when concurrencyLimit is 0", async () => {
    const seen: string[] = [];

    const items = [
      { ...item("1"), run: async () => { seen.push("1"); return { kind: "success" as const }; } },
    ];

    await runConcurrentBatch(items, { concurrencyLimit: 0 });

    expect(seen).toEqual(["1"]);
  });
});
