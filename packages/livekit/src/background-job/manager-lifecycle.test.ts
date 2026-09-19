import { toBackgroundJobNotificationParts } from "../chat/background-job-notification";
import type { BackgroundJobEvent } from "@getpochi/common";
import { describe, expect, it, vi } from "vitest";
import { createForkAgent } from "../background-task/fork-agent";
import { defaultCatalog as catalog } from "../livestore";
import type { Message, Task } from "../types";
import { makeJobStore } from "./__tests__/test-store";
import { BackgroundJobManager } from "./manager";

function subtask(id = "child", overrides: Partial<Task> = {}): Task {
  return {
    id,
    parentId: "parent",
    background: false,
    status: "pending-tool",
    ...overrides,
  } as Task;
}

function resultMessage(status: "completed" | "pending-input"): Message {
  return {
    id: "result",
    role: "assistant",
    parts: [
      status === "completed"
        ? {
            type: "tool-attemptCompletion",
            toolCallId: "result",
            state: "input-available",
            input: { result: "Finished during handoff." },
          }
        : {
            type: "tool-askFollowupQuestion",
            toolCallId: "question",
            state: "input-available",
            input: { questions: [{ question: "Which branch?" }] },
          },
    ],
  } as Message;
}

describe("background task registration and handoff", () => {
  it("registers a fork with its owner and kind before an executor is available", async () => {
    const { store } = makeJobStore();
    const manager = BackgroundJobManager.forStore(store);
    manager.start();
    try {
      const fork = await manager.startForkAgent(
        createForkAgent<Message>({
          label: "task-memory",
          parentTaskId: "parent",
          parentMessages: [],
          parentCwd: "/repo",
          directive: "Extract memory",
          maxSteps: 2,
        }),
      );
      expect(manager.getJobsForTask("parent")).toEqual([
        expect.objectContaining({
          taskId: fork.taskId,
          kind: "fork",
          status: "running",
        }),
      ]);
      await manager.kill(`bgjob-task-${fork.taskId}`, "parent");
      expect(manager.hasPending("parent")).toBe(false);
      expect(manager.getPendingNotifications("parent")).toEqual([]);
    } finally {
      await manager.dispose();
    }
  });

  it.each(["completed", "pending-input"] as const)(
    "delivers a task that reaches %s while the foreground is stopping",
    async (status) => {
      const data = makeJobStore();
      data.tasks.set("child", subtask());
      const manager = BackgroundJobManager.forStore(data.store);
      manager.start();
      await manager.watchTask("parent");
      try {
        await manager.backgroundSubTask({
          taskId: "child",
          parentTaskId: "parent",
          agentType: "explore",
          stopForeground: async () => {
            data.tasks.set("child", subtask("child", { status }));
            data.setMessages("child", [resultMessage(status)]);
          },
        });
        expect(data.tasks.get("child")).toMatchObject({
          status,
          background: true,
        });
        expect(manager.getJobsForTask("parent")).toEqual([
          expect.objectContaining({
            taskId: "child",
            status: "completed",
            agentType: "explore",
          }),
        ]);
        const notices = manager.getPendingNotifications("parent");
        expect(notices).toEqual([
          expect.objectContaining({
            kind: "subagent",
            status: "completed",
            result:
              status === "completed"
                ? "Finished during handoff."
                : "Which branch?",
          }),
        ]);
        expect(data.commit).toHaveBeenCalledOnce();
        expect(data.commit.mock.calls[0]).toHaveLength(1);
        data.setMessages("parent", [
          {
            id: "delivered",
            role: "user",
            parts: toBackgroundJobNotificationParts([notices[0]]),
          },
        ]);
        expect(manager.getPendingNotifications("parent")).toEqual([]);
      } finally {
        await manager.dispose();
      }
    },
  );

  it("resumes an interrupted foreground turn without publishing a stopped result", async () => {
    const data = makeJobStore();
    data.tasks.set("child", subtask());
    data.setMessages("child", [
      { id: "prompt", role: "user", parts: [{ type: "text", text: "Work" }] },
    ]);
    const manager = BackgroundJobManager.forStore(data.store);
    manager.start();
    await manager.watchTask("parent");
    const published: BackgroundJobEvent[] = [];
    const unsubscribe = manager.subscribeNotifications("parent", (notices) =>
      published.push(...notices),
    );
    try {
      await manager.backgroundSubTask({
        taskId: "child",
        parentTaskId: "parent",
        stopForeground: async () => {
          data.store.commit(
            catalog.events.taskFailed({
              id: "child",
              error: { kind: "AbortError", message: "Stopped foreground." },
              updatedAt: new Date(),
            }),
          );
        },
      });
      expect(data.tasks.get("child")).toMatchObject({
        background: true,
        status: "pending-model",
      });
      expect(manager.hasPending("parent")).toBe(true);
      expect(published).toEqual([]);
      expect(data.commit.mock.calls.at(-1)?.map((event) => event.name)).toEqual(
        ["v1.TaskBackgrounded", "v1.ChatStreamStarted"],
      );
    } finally {
      unsubscribe();
      await manager.dispose();
    }
  });

  it("restores terminal jobs and observes later background jobs without an executor", async () => {
    const data = makeJobStore();
    data.tasks.set(
      "existing",
      subtask("existing", { background: true, status: "completed" }),
    );
    const manager = BackgroundJobManager.forStore(data.store);
    manager.start();
    try {
      await manager.watchTask("parent");
      expect(manager.getJobsForTask("parent")).toHaveLength(1);
      data.tasks.set("incoming", subtask("incoming", { status: "completed" }));
      data.store.commit(
        catalog.events.taskBackgrounded({
          id: "incoming",
          updatedAt: new Date(),
        }),
      );
      await vi.waitFor(() =>
        expect(manager.getJobsForTask("parent")).toHaveLength(2),
      );
      expect(manager.getPendingNotifications("parent")).toHaveLength(2);
    } finally {
      await manager.dispose();
    }
  });

  it("registers and stops a queued task when all execution slots are occupied", async () => {
    const data = makeJobStore();
    for (let i = 0; i < 11; i++)
      data.tasks.set(`child-${i}`, subtask(`child-${i}`));
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waitUntilReady = vi.fn(() => ready);
    const manager = BackgroundJobManager.forStore(data.store);
    manager.initialize({
      blobStore: {} as never,
      adaptor: {
        waitUntilReady,
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall: vi.fn(),
      },
    });
    try {
      for (let i = 0; i < 11; i++)
        await manager.backgroundSubTask({
          taskId: `child-${i}`,
          parentTaskId: "parent",
        });
      expect(waitUntilReady).toHaveBeenCalledTimes(10);
      expect(manager.getJobsForTask("parent")).toHaveLength(11);
      await manager.kill("bgjob-task-child-10", "parent");
      expect(data.tasks.get("child-10")).toMatchObject({
        status: "failed",
        error: { kind: "AbortError" },
      });
      expect(waitUntilReady).toHaveBeenCalledTimes(10);
      expect(
        manager
          .getJobsForTask("parent")
          .filter((job) => job.status === "running"),
      ).toHaveLength(10);
    } finally {
      const disposed = manager.dispose();
      release();
      await disposed;
    }
  });
});
