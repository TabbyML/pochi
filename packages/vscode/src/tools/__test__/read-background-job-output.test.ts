import * as assert from "node:assert";
import { afterEach, describe, it } from "mocha";
import { OutputManager } from "../../integrations/terminal/output";

/**
 * `readBackgroundJobOutput` resolves output through the shared `OutputManager`
 * registry keyed by a terminal id. Background jobs and (newly) user-opened
 * terminals both register their output here, which is what allows the model to
 * read any terminal by id. These tests cover that registry contract directly
 * (importing the tool itself pulls in the webview/layout module chain, which is
 * not available in the unit test host).
 */
describe("OutputManager registry (readBackgroundJobOutput backing store)", () => {
  const createdIds: string[] = [];

  const track = (id: string) => {
    createdIds.push(id);
    return id;
  };

  afterEach(() => {
    for (const id of createdIds) {
      OutputManager.delete(id);
    }
    createdIds.length = 0;
  });

  it("captures and returns output for a background job id", () => {
    const id = track("bgjob-read-test");
    const manager = OutputManager.create({ id, command: "echo hello" });
    manager.addChunk("hello world\n");
    manager.finalize();

    const found = OutputManager.get(id);
    assert.ok(found, "manager should be retrievable by id");

    const result = found.readOutput();
    assert.ok(
      result.output.includes("hello world"),
      `expected captured output, got: ${JSON.stringify(result)}`,
    );
    assert.strictEqual(result.status, "completed");
  });

  it("captures and returns output for a user-opened terminal id (term- prefix)", () => {
    const id = track("term-read-test");
    const manager = OutputManager.create({ id, command: "ls" });
    manager.addChunk("file-a file-b\n");
    manager.finalize();

    const result = OutputManager.get(id)?.readOutput();
    assert.ok(result?.output.includes("file-a"), "expected captured output");
  });

  it("returns only new output since the last read", () => {
    const id = track("bgjob-incremental");
    const manager = OutputManager.create({ id, command: "run" });

    manager.addChunk("first\n");
    assert.ok(manager.readOutput().output.includes("first"));

    manager.addChunk("second\n");
    // Simulate time passing so the rapid-read guard does not reject the read
    (manager as unknown as { lastReadAt: number }).lastReadAt =
      Date.now() - 1000;
    const second = manager.readOutput();
    assert.ok(second.output.includes("second"));
    assert.ok(
      !second.output.includes("first"),
      "already-read output should not be returned again",
    );
  });

  it("is unresolvable once deleted (e.g. terminal closed)", () => {
    const id = "bgjob-closed-terminal";
    OutputManager.create({ id, command: "ls" });
    assert.ok(OutputManager.get(id));

    OutputManager.delete(id);
    assert.strictEqual(
      OutputManager.get(id),
      undefined,
      "a closed terminal's output should no longer be readable",
    );
  });
});
