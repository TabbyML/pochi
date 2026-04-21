import { describe, expect, it, vi } from "vitest";
import {
  BatchExecutionError,
  checkReadOnlyConstraints,
  executePartitionedToolCalls,
  getToolCallBatchMode,
  isReadonlyToolCall,
  isSafeToBatchToolCall,
  partitionToolCalls,
} from "../batch-utils";

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

describe("checkReadOnlyConstraints", () => {
  it("returns false for empty or whitespace-only input", () => {
    expect(checkReadOnlyConstraints("")).toBe(false);
    expect(checkReadOnlyConstraints("   ")).toBe(false);
  });

  it("returns false for command substitution $()", () => {
    expect(checkReadOnlyConstraints("echo $(cat /etc/passwd)")).toBe(false);
  });

  it("returns false for output redirect (>, >>)", () => {
    expect(checkReadOnlyConstraints("echo hello > /tmp/out.txt")).toBe(false);
    expect(checkReadOnlyConstraints("cat file.txt >> /tmp/out.txt")).toBe(false);
  });

  it("returns true for simple readonly commands", () => {
    expect(checkReadOnlyConstraints("cat file.txt")).toBe(true);
    expect(checkReadOnlyConstraints("find . -name '*.ts'")).toBe(true);
  });

  it("returns true for piped readonly commands", () => {
    expect(checkReadOnlyConstraints("cat file.txt | grep 'foo'")).toBe(true);
  });

  it("returns false for always-stateful commands (rm, sudo)", () => {
    expect(checkReadOnlyConstraints("rm -rf /tmp/foo")).toBe(false);
    expect(checkReadOnlyConstraints("sudo cat /etc/shadow")).toBe(false);
  });

  it("returns false for git write operations", () => {
    expect(checkReadOnlyConstraints("git commit -m 'test'")).toBe(false);
  });

  it("returns true for git read operations", () => {
    expect(checkReadOnlyConstraints("git diff HEAD")).toBe(true);
    expect(checkReadOnlyConstraints("git log --oneline -10")).toBe(true);
  });

  it("returns false for git branch <name> (creates branch)", () => {
    expect(checkReadOnlyConstraints("git branch new-feature")).toBe(false);
  });

  it("returns true for git branch with no positional args (list)", () => {
    expect(checkReadOnlyConstraints("git branch")).toBe(true);
    expect(checkReadOnlyConstraints("git branch -v")).toBe(true);
  });

  it("returns false for sed -i (in-place edit)", () => {
    expect(checkReadOnlyConstraints("sed -i 's/foo/bar/g' file.txt")).toBe(false);
  });

  it("returns true for sed without -i", () => {
    expect(checkReadOnlyConstraints("sed 's/foo/bar/g' file.txt")).toBe(true);
  });

  it("returns false for curl (always in AlwaysStatefulCommands)", () => {
    expect(checkReadOnlyConstraints("curl https://api.example.com/data")).toBe(false);
  });

  it("returns false when a pipe chain includes a stateful command", () => {
    expect(checkReadOnlyConstraints("cat file.txt && rm -rf /tmp/work")).toBe(false);
  });

  it("returns false for unquoted variable expansion", () => {
    expect(checkReadOnlyConstraints("cat $FILENAME")).toBe(false);
  });
});

describe("isReadonlyToolCall", () => {
  it("returns true for readFile", () => {
    expect(isReadonlyToolCall("readFile", {})).toBe(true);
  });

  it("returns true for listFiles", () => {
    expect(isReadonlyToolCall("listFiles", {})).toBe(true);
  });

  it("returns true for executeCommand with a readonly command", () => {
    expect(
      isReadonlyToolCall("executeCommand", { command: "cat README.md" }),
    ).toBe(true);
  });

  it("returns false for executeCommand with a stateful command", () => {
    expect(
      isReadonlyToolCall("executeCommand", { command: "rm -rf /tmp" }),
    ).toBe(false);
  });

  it("returns false for executeCommand with missing command field", () => {
    expect(isReadonlyToolCall("executeCommand", {})).toBe(false);
  });

  it("returns false for writeToFile", () => {
    expect(isReadonlyToolCall("writeToFile", {})).toBe(false);
  });

  it("returns false for applyDiff", () => {
    expect(isReadonlyToolCall("applyDiff", {})).toBe(false);
  });

  it("returns false for unknown tool", () => {
    expect(isReadonlyToolCall("someUnknownTool", {})).toBe(false);
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
      executePartitionedToolCalls([], { concurrencyLimit: 1, execute }),
    ).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes a single serial item", async () => {
    const executed: string[] = [];
    const items = [item("writeToFile")];
    const batches = partitionToolCalls(items, getToolCall);

    await executePartitionedToolCalls(batches, {
      concurrencyLimit: 1,
      execute: async (it) => {
        executed.push((it as SimpleItem).toolName);
      },
    });

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

    await executePartitionedToolCalls(batches, {
      concurrencyLimit: 10,
      execute: async (it) => {
        executed.push((it as SimpleItem).toolName);
      },
    });

    expect(executed).toHaveLength(3);
    expect(executed).toContain("readFile");
    expect(executed).toContain("listFiles");
    expect(executed).toContain("globFiles");
  });

  it("passes an AbortSignal to each execute call", async () => {
    const receivedSignals: AbortSignal[] = [];
    const items = [item("readFile"), item("writeToFile")];
    const batches = partitionToolCalls(items, getToolCall);

    await executePartitionedToolCalls(batches, {
      concurrencyLimit: 5,
      execute: async (_it, _batchMode, signal) => {
        receivedSignals.push(signal);
      },
    });

    expect(receivedSignals).toHaveLength(2);
    for (const sig of receivedSignals) {
      expect(sig).toBeInstanceOf(AbortSignal);
    }
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

    await executePartitionedToolCalls(batches, {
      concurrencyLimit: 5,
      execute: async (it) => {
        await log((it as SimpleItem).toolName)();
      },
    });

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
      await executePartitionedToolCalls(batches, {
        concurrencyLimit: 1,
        execute: async (it) => {
          if ((it as (typeof items)[number]).id === "a") {
            throw new Error("item a failed");
          }
        },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BatchExecutionError);
    const err = caught as BatchExecutionError<unknown>;
    expect(err.pendingItems).toHaveLength(2); // b and c were not yet started
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
      await executePartitionedToolCalls(batches, {
        concurrencyLimit: 5,
        execute: async (it) => {
          if ((it as (typeof items)[number]).id === "a") {
            throw new Error("first item failed");
          }
        },
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BatchExecutionError);
    const err = caught as BatchExecutionError<unknown>;
    // b (serial batch 2) + c (concurrent batch 3) are pending
    expect(err.pendingItems).toHaveLength(2);
  });
});
