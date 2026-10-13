import type { BrowserSessionStore } from "@getpochi/common/browser";
import type { ValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import { describe, expect, it, vi } from "vitest";
import { TaskRunner } from "../../task-runner";
import { createTestCliAdaptor } from "./cli-adaptor";

function setup(registerBrowserSession: () => Promise<unknown>) {
  const { store, tasks } = makeJobStore();
  tasks.set("browser-task", {
    id: "browser-task",
    cwd: "/repo",
    status: "completed",
    parentId: null,
    background: false,
  } as Task);
  const unregisterBrowserSession = vi.fn();
  const runner = new TaskRunner({
    adaptor: createTestCliAdaptor({ store }),
    uid: "browser-task",
    cwd: "/repo",
    store,
    blobStore: {} as never,
    llm: { id: "test" } as never,
    filesystem: {} as never,
    rg: "rg",
    maxSteps: 24,
    maxRetries: 3,
    asyncWaitTimeoutInMs: 0,
    customAgent: { name: "browser" } as ValidCustomAgentFile,
    browserSessionStore: {
      registerBrowserSession,
      unregisterBrowserSession,
    } as unknown as BrowserSessionStore,
  });
  const step = vi
    .spyOn(runner as unknown as { step(): Promise<string> }, "step")
    .mockResolvedValue("finished");
  return { runner, step, unregisterBrowserSession };
}

describe("direct CLI browser agent startup", () => {
  it("waits for the session environment before executing the first step", async () => {
    let finish!: () => void;
    const register = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { runner, step, unregisterBrowserSession } = setup(register);
    const run = runner.run();
    await vi.waitFor(() =>
      expect(register).toHaveBeenCalledWith("browser-task"),
    );
    expect(step).not.toHaveBeenCalled();
    finish();
    await run;
    expect(step).toHaveBeenCalledOnce();
    expect(unregisterBrowserSession).toHaveBeenCalledWith("browser-task");
  });

  it("does not execute browser commands when session preparation fails", async () => {
    const { runner, step } = setup(async () => {
      throw new Error("stream setup failed");
    });
    await expect(runner.run()).rejects.toThrow("stream setup failed");
    expect(step).not.toHaveBeenCalled();
  });
});
