import assert from "assert";
import "reflect-metadata";
import { FileStateCacheRegistry } from "../file-state-cache-registry";

describe("FileStateCacheRegistry", () => {
  it("deletes task caches instead of keeping cleared entries around", () => {
    const registry = new FileStateCacheRegistry();

    const cache = registry.get("task-1");
    cache.set("/tmp/file.txt", {
      content: "hello",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    registry.delete("task-1");

    assert.strictEqual(registry.has("task-1"), false);
    const nextCache = registry.get("task-1");
    assert.notStrictEqual(nextCache, cache);
    assert.strictEqual(nextCache.size, 0);
  });

  it("disposes all retained caches", () => {
    const registry = new FileStateCacheRegistry();

    registry.get("task-1").set("/tmp/one.txt", {
      content: "one",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });
    registry.get("task-2").set("/tmp/two.txt", {
      content: "two",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    registry.dispose();

    assert.strictEqual(registry.has("task-1"), false);
    assert.strictEqual(registry.has("task-2"), false);
  });
});
