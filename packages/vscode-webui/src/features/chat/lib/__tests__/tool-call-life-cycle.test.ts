import { describe, expect, it, vi } from "vitest";
import { ManagedToolCallLifeCycle } from "../tool-call-life-cycle";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
}));

function makeStore() {
  return {
    storeId: "store-1",
    subscribe: vi.fn(() => vi.fn()),
  };
}

async function makeStreamingNewTaskLifecycle(
  outerAbortSignal = new AbortController().signal,
) {
  const lifecycle = new ManagedToolCallLifeCycle(
    makeStore() as never,
    { toolName: "newTask", toolCallId: "tool-call-1" },
    outerAbortSignal,
  );

  lifecycle.execute({ _meta: { uid: "subtask-1" } });
  await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));

  return lifecycle;
}

describe("ManagedToolCallLifeCycle", () => {
  it("aborts a streaming newTask without double-transitioning", async () => {
    const lifecycle = await makeStreamingNewTaskLifecycle();

    expect(() => lifecycle.abort("user-abort")).not.toThrow();
    expect(lifecycle.status).toBe("complete");
    expect(lifecycle.complete.reason).toBe("user-abort");
  });

  it("completes a streaming newTask when the outer abort signal fires", async () => {
    const outerAbortController = new AbortController();
    const lifecycle = await makeStreamingNewTaskLifecycle(
      outerAbortController.signal,
    );

    outerAbortController.abort("user-abort");

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.reason).toBe("user-abort");
  });
});
