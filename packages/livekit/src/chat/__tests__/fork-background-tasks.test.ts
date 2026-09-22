import {
  createBackgroundSubAgentStartedResult,
  getSubAgentBackgroundJobId,
  getSubAgentNotificationId,
} from "@getpochi/common";
import { Schema } from "@livestore/livestore";
import { describe, expect, it } from "vitest";
import { makeJobStore } from "../../background-job/__tests__/test-store";
import { BackgroundJobManager } from "../../background-job/manager";
import { defaultCatalog as catalog } from "../../livestore";
import { createBackgroundSubagentNotification } from "../../task-utils";
import type { Message, Task } from "../../types";
import { prepareForkTaskData } from "../fork-task-tools";

function makeFork(
  childFields: Partial<Task> = {},
  {
    includeNotification = true,
    extraParts = [],
  }: {
    includeNotification?: boolean;
    extraParts?: Message["parts"];
  } = {},
) {
  const original = makeJobStore();
  const parent = {
    id: "parent",
    status: "completed",
    createdAt: new Date(),
  } as Task;
  const child = {
    ...parent,
    id: "child",
    parentId: parent.id,
    background: true,
    ...childFields,
  } as Task;
  const launch: Message = {
    id: "launch",
    role: "assistant",
    parts: [
      {
        type: "tool-newTask",
        toolCallId: "launch-child",
        state: "output-available",
        input: {
          description: "Research",
          prompt: "Research this",
          background: true,
          _meta: { uid: child.id },
        },
        output: {
          result: createBackgroundSubAgentStartedResult(child.id),
          backgroundJobId: getSubAgentBackgroundJobId(child.id),
        },
      },
      ...extraParts,
    ],
  };
  const childMessages: Message[] = [
    {
      id: "child-result",
      role: "assistant",
      parts: [
        {
          type: "tool-attemptCompletion",
          toolCallId: "finish",
          state: "input-available",
          input: { result: "Research complete" },
        },
      ],
    },
  ];
  original.tasks.set(parent.id, parent);
  original.tasks.set(child.id, child);
  original.setMessages(child.id, childMessages);
  const parentMessages: Message[] = [launch];
  if (includeNotification) {
    parentMessages.push({
      id: "notification",
      role: "user",
      parts: [
        {
          type: "data-background-job-notification",
          data: createBackgroundSubagentNotification(
            original.store,
            child,
            parentMessages,
          ),
        },
      ],
    });
  }
  original.setMessages(parent.id, parentMessages);
  const data = prepareForkTaskData({
    tasks: [parent, child],
    messages: [...original.messages].flatMap(([taskId, messages]) =>
      messages.map((data) => ({ id: data.id, taskId, data })),
    ),
    files: [],
    oldTaskId: parent.id,
    newTaskId: "fork",
    newTaskTitle: "Fork",
    commitId: "unused",
    messageId: parentMessages.at(-1)!.id,
  });
  // Exercise the persisted event schema: unrecognized fields are stripped
  // during serialization even when prepareForkTaskData returns them correctly.
  const eventSchema = catalog.events.forkTaskInited.schema;
  const persisted = Schema.decodeSync(eventSchema)(
    Schema.encodeSync(eventSchema)(data),
  );
  const forked = makeJobStore();
  for (const task of persisted.tasks) forked.tasks.set(task.id, task as Task);
  for (const message of persisted.messages) {
    const messages = forked.messages.get(message.taskId) ?? [];
    forked.messages.set(message.taskId, [...messages, message.data as Message]);
  }
  return {
    original,
    child,
    forked,
    copiedChild: persisted.tasks.find((task) => task.parentId === "fork")!,
  };
}

describe("forked background tasks", () => {
  it.each(["pending-model", "pending-tool"] as const)(
    "stops a %s background copy without losing its job metadata",
    async (status) => {
      const { original, child, forked, copiedChild } = makeFork(
        { status },
        { includeNotification: false },
      );
      expect(copiedChild).toMatchObject({
        background: true,
        status: "failed",
        error: {
          kind: "AbortError",
          message:
            "Background subtask was interrupted when the task was forked.",
        },
      });
      expect(forked.store.query(catalog.queries.runnableTasks$)).toEqual([]);
      expect(original.tasks.get(child.id)?.status).toBe(status);
      const manager = BackgroundJobManager.forStore(forked.store);
      manager.start();
      try {
        await manager.watchTask("fork");
        expect(manager.getJobsForTask("fork")).toMatchObject([
          { taskId: copiedChild.id, status: "stopped" },
        ]);
        expect(manager.hasPending("fork")).toBe(false);
        expect(manager.getPendingNotifications("fork")).toMatchObject([
          {
            taskId: copiedChild.id,
            status: "stopped",
            notificationId: getSubAgentNotificationId(copiedChild),
          },
        ]);
      } finally {
        await manager.dispose();
      }
    },
  );

  it.each([
    { status: "completed" as const, error: null },
    {
      status: "failed" as const,
      error: { kind: "AbortError" as const, message: "Stopped by user." },
    },
    {
      status: "failed" as const,
      error: { kind: "InternalError" as const, message: "Subagent failed." },
    },
  ])(
    "keeps terminal state and deduplicates the remapped notification: %j",
    async (fields) => {
      const { forked, copiedChild } = makeFork(fields);
      expect(copiedChild.background).toBe(true);
      expect(copiedChild.status).toBe(fields.status);
      expect(copiedChild.error).toEqual(fields.error ?? undefined);
      const notification = forked.messages.get("fork")![1].parts[0];
      expect(notification).toMatchObject({
        data: {
          taskId: copiedChild.id,
          backgroundJobId: getSubAgentBackgroundJobId(copiedChild.id),
          notificationId: getSubAgentNotificationId(copiedChild),
        },
      });
      expect(forked.messages.get(copiedChild.id)).toHaveLength(1);
      const manager = BackgroundJobManager.forStore(forked.store);
      manager.start();
      try {
        await manager.watchTask("fork");
        expect(manager.getJobsForTask("fork")).toHaveLength(1);
        expect(manager.getPendingNotifications("fork")).toEqual([]);
      } finally {
        await manager.dispose();
      }
    },
  );

  it("rewrites launch results and job tool inputs while preserving command job references", () => {
    const oldJobId = getSubAgentBackgroundJobId("child");
    const commandNotification: Message["parts"][number] = {
      type: "data-background-job-notification",
      data: {
        kind: "command",
        notificationId: "command-notification",
        backgroundJobId: "bgjob-cmd-command",
        finishedAt: 1,
        outputFile: "/tmp/command.log",
        status: "completed",
        summary: "Done",
      },
    };
    const { original, forked, copiedChild } = makeFork(
      {},
      {
        extraParts: [
          {
            type: "tool-killBackgroundJob",
            toolCallId: "kill",
            state: "input-available",
            input: { backgroundJobId: oldJobId },
          },
          {
            type: "tool-readBackgroundJobOutput",
            toolCallId: "read",
            state: "input-available",
            input: { backgroundJobId: oldJobId },
          },
          {
            type: "tool-killBackgroundJob",
            toolCallId: "kill-command",
            state: "input-available",
            input: { backgroundJobId: "bgjob-cmd-command" },
          },
          commandNotification,
        ],
      },
    );
    const parts = forked.messages.get("fork")![0].parts;
    const newJobId = getSubAgentBackgroundJobId(copiedChild.id);
    expect(parts[0]).toMatchObject({
      input: { _meta: { uid: copiedChild.id } },
      output: {
        backgroundJobId: newJobId,
        result: createBackgroundSubAgentStartedResult(copiedChild.id),
      },
    });
    expect(parts[1]).toMatchObject({ input: { backgroundJobId: newJobId } });
    expect(parts[2]).toMatchObject({ input: { backgroundJobId: newJobId } });
    expect(parts[3]).toMatchObject({
      input: { backgroundJobId: "bgjob-cmd-command" },
    });
    expect(parts[4]).toEqual(commandNotification);
    expect(original.messages.get("parent")![0].parts[0]).toMatchObject({
      input: { _meta: { uid: "child" } },
      output: { backgroundJobId: oldJobId },
    });
  });

  it("still decodes fork events written before background metadata was added", () => {
    const decoded = Schema.decodeSync(catalog.events.forkTaskInited.schema)({
      tasks: [
        {
          id: "old-fork",
          status: "pending-model",
          createdAt: new Date().toISOString(),
        },
      ],
      messages: [],
      files: [],
    });
    expect(decoded.tasks[0]).toMatchObject({
      id: "old-fork",
      status: "pending-model",
    });
  });
});
