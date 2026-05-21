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

  it("copies a source task cache without sharing cache state", () => {
    const registry = new FileStateCacheRegistry();

    const sourceCache = registry.get("parent-task");
    sourceCache.set("/tmp/file.txt", {
      content: "hello",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    registry.copyIfAbsent("parent-task", "fork-task");

    const forkCache = registry.get("fork-task");
    assert.notStrictEqual(forkCache, sourceCache);
    assert.deepStrictEqual(forkCache.get("/tmp/file.txt"), {
      content: "hello",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    forkCache.set("/tmp/file.txt", {
      content: "fork",
      timestamp: 2,
      startLine: undefined,
      endLine: undefined,
      fromWrite: true,
    });

    assert.strictEqual(sourceCache.get("/tmp/file.txt")?.content, "hello");
  });

  it("does not overwrite an existing target cache when copying", () => {
    const registry = new FileStateCacheRegistry();

    registry.get("parent-task").set("/tmp/file.txt", {
      content: "parent",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });
    registry.get("fork-task").set("/tmp/file.txt", {
      content: "existing",
      timestamp: 2,
      startLine: 1,
      endLine: 1,
    });

    registry.copyIfAbsent("parent-task", "fork-task");

    assert.strictEqual(
      registry.get("fork-task").get("/tmp/file.txt")?.content,
      "existing",
    );
  });

  it("copies into an empty target cache", () => {
    const registry = new FileStateCacheRegistry();

    registry.get("parent-task").set("/tmp/file.txt", {
      content: "parent",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });
    registry.get("fork-task");

    registry.copyIfAbsent("parent-task", "fork-task");

    assert.strictEqual(
      registry.get("fork-task").get("/tmp/file.txt")?.content,
      "parent",
    );
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
