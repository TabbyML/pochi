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
      taskActivityTracker: { getTaskAbortSignal: () => task.signal },
      mcpHub: { executeFns: { value: { testTool: tool } } },
    });
    const prepare = sinon.stub(host, "resolveToolCallEnvs").resolves(undefined);
    const execute = () =>
      host.executeToolCall(
        "testTool",
        {},
        {
          toolCallId: "call1",
          storeId: "test-store",
          taskId: "parent",
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
    return { caller, task, tool, prepare, execute };
  }

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
