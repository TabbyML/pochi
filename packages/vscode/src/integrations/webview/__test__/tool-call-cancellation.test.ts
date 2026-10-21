import * as assert from "node:assert";
import { before, describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";

describe("tool-call cancellation", () => {
  let VSCodeHostImpl: typeof import("../vscode-host-impl").VSCodeHostImpl;
  before(() => {
    ({ VSCodeHostImpl } = proxyquire.noCallThru().load("../vscode-host-impl", {
      // The test runner uses CommonJS; these transport packages are ESM-only.
      "@quilted/threads": { "@global": true },
      "@quilted/threads/signals": { "@global": true },
      "@getpochi/common/store-id-utils": {
        decodeStoreId: () => ({ taskId: "parent" }),
        "@global": true,
      },
      "./webview-panel": {},
      "./webview-standalone-panel": {},
    }));
  });

  function createHarness() {
    const caller = new AbortController();
    const task = new AbortController();
    const tool = sinon.stub().resolves({ success: true });
    const host = Reflect.construct(VSCodeHostImpl, []) as InstanceType<
      typeof VSCodeHostImpl
    >;
    Object.assign(host, {
      workspaceScope: { cwd: "/workspace" },
      worktreeManager: {
        worktrees: { value: [{ path: "/workspace", isMain: true }] },
      },
      taskActivityTracker: { getTaskAbortSignal: () => task.signal },
      mcpHub: { executeFns: { value: { testTool: tool } } },
      fileStateCacheRegistry: { get: () => undefined },
      capture: () => {},
    });
    const prepare = sinon.stub(host, "resolveToolCallEnvs").resolves(undefined);
    const execute = (taskId = "parent") =>
      host.executeToolCall(
        "testTool",
        {},
        {
          toolCallId: "call1",
          storeId: "test-store",
          taskId,
          abortSignal: {
            aborted: caller.signal.aborted,
            start: (listener) => {
              caller.signal.addEventListener("abort", () => listener(true), {
                once: true,
              });
            },
          },
        },
      );
    return { host, caller, task, tool, prepare, execute };
  }

  it("runs a subagent task's tools in its isolated worktree", async () => {
    const h = createHarness();
    (
      h.host as unknown as { subagentWorktreePaths: Map<string, string> }
    ).subagentWorktreePaths.set("subagent", "/workspace.worktree/subagent-1");

    await h.execute("subagent");
    await h.execute("parent");

    assert.strictEqual(
      h.tool.firstCall.args[1].cwd,
      "/workspace.worktree/subagent-1",
    );
    assert.strictEqual(h.tool.secondCall.args[1].cwd, "/workspace");
  });

  for (const source of ["caller", "task"] as const) {
    it(`skips resource preparation when ${source} has already aborted`, async () => {
      const h = createHarness();
      h[source].abort();
      assert.deepStrictEqual(await h.execute(), {
        error: "Tool call aborted.",
      });
      assert.ok(h.prepare.notCalled);
      assert.ok(h.tool.notCalled);
    });

    it(`does not execute if ${source} aborts during resource preparation`, async () => {
      const h = createHarness();
      h.prepare.callsFake(async () => {
        h[source].abort();
        return undefined;
      });
      assert.deepStrictEqual(await h.execute(), {
        error: "Tool call aborted.",
      });
      assert.ok(h.prepare.calledOnce);
      assert.ok(h.tool.notCalled);
    });
  }
});
