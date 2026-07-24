import * as assert from "assert";
import { describe, it } from "mocha";
import { TerminalHistoryManager } from "../terminal-history";

describe("TerminalHistoryManager", () => {
  it("accumulates cwd + command + output across multiple commands", () => {
    const id = "term-history-test";
    const history = TerminalHistoryManager.getOrCreate(id);

    history.beginCommand("ls", "/workspace");
    history.addChunk("file-a\nfile-b\n");
    history.finalize();

    history.beginCommand("pwd", "/workspace");
    history.addChunk("/workspace\n");
    history.finalize();

    const result = history.readOutput();
    assert.strictEqual(
      result.output,
      "/workspace$ ls\nfile-a\nfile-b\n/workspace$ pwd\n/workspace\n",
    );
    assert.strictEqual(result.status, "completed");

    TerminalHistoryManager.delete(id);
  });

  it("omits the cwd line when cwd is unavailable", () => {
    const id = "term-history-no-cwd";
    const history = TerminalHistoryManager.getOrCreate(id);

    history.beginCommand("echo hi");
    history.addChunk("hi\n");
    history.finalize();

    const result = history.readOutput();
    assert.strictEqual(result.output, "$ echo hi\nhi\n");

    TerminalHistoryManager.delete(id);
  });

  it("returns only new content since the last read (incremental)", () => {
    const id = "term-history-incremental";
    const history = TerminalHistoryManager.getOrCreate(id);

    history.beginCommand("echo one", "/workspace");
    history.addChunk("one\n");
    history.finalize();

    const first = history.readOutput();
    assert.strictEqual(first.output, "/workspace$ echo one\none\n");

    (history as unknown as { lastReadAt: number }).lastReadAt =
      Date.now() - 1000;

    history.beginCommand("echo two", "/workspace");
    history.addChunk("two\n");
    history.finalize();

    (history as unknown as { lastReadAt: number }).lastReadAt =
      Date.now() - 1000;
    const second = history.readOutput();
    assert.strictEqual(second.output, "/workspace$ echo two\ntwo\n");
    assert.ok(
      !second.output.includes("echo one"),
      "already-read history should not be returned again",
    );

    TerminalHistoryManager.delete(id);
  });

  it("getOrCreate returns the same instance for the same id", () => {
    const id = "term-history-same-instance";
    const a = TerminalHistoryManager.getOrCreate(id);
    const b = TerminalHistoryManager.getOrCreate(id);
    assert.strictEqual(a, b);
    TerminalHistoryManager.delete(id);
  });

  it("is unresolvable once deleted (e.g. terminal closed)", () => {
    const id = "term-history-closed";
    TerminalHistoryManager.getOrCreate(id);
    assert.ok(TerminalHistoryManager.get(id));

    TerminalHistoryManager.delete(id);
    assert.strictEqual(TerminalHistoryManager.get(id), undefined);
  });

  it("evicts the oldest lines once MaxTerminalHistoryLines is exceeded", () => {
    const id = "term-history-maxlines";
    const history = TerminalHistoryManager.getOrCreate(id);

    // MaxTerminalHistoryLines is 500, and each command contributes 2 lines
    // (header + output), so produce well over 250 commands to trigger
    // eviction without needing huge buffers.
    for (let i = 0; i < 260; i++) {
      history.beginCommand(`echo ${i}`, "/workspace");
      history.addChunk(`${i}\n`);
      history.finalize();
    }

    const result = history.readOutput();
    assert.ok(result.isTruncated, "expected history to be truncated");
    // The oldest command should have been evicted.
    assert.ok(
      !result.output.includes("echo 0\n"),
      "expected the oldest command to be evicted",
    );
    // The most recent command should still be present.
    assert.ok(result.output.includes("echo 259"));

    TerminalHistoryManager.delete(id);
  });
});
