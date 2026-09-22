import {
  getSubAgentBackgroundJobId,
  getSubAgentTaskId,
} from "@getpochi/common";
import type { UIMessagePart } from "ai";
import type { tables } from "../livestore/default-schema";
import type { DataParts, UITools } from "../types";

type DBMessageShape = {
  readonly id: string;
  readonly data: {
    readonly id: string;
    readonly parts: readonly UIMessagePart<DataParts, UITools>[];
    readonly role: "user" | "assistant" | "system";
  };
  readonly taskId: string;
};

export const prepareForkTaskData = ({
  tasks,
  messages,
  files,
  oldTaskId,
  commitId,
  messageId,
  newTaskId,
  newTaskTitle,
}: {
  tasks: typeof tables.tasks.ResultType;
  messages: typeof tables.messages.ResultType;
  files: typeof tables.files.ResultType;
  oldTaskId: string;
  commitId: string;
  messageId: string | undefined;
  newTaskId: string;
  newTaskTitle: string | undefined;
}) => {
  const now = new Date();

  // Exclude independent background roots (e.g. fork-agent memory jobs) and
  // their descendants. Background subagents with a parentId are part of the
  // conversation and must be copied so tool-newTask references can be remapped.
  // The task being forked (oldTaskId) is always kept.
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const isBackgroundDescendant = (task: (typeof tasks)[number]): boolean => {
    const visited = new Set<string>();
    let current: (typeof tasks)[number] | undefined = task;
    while (current) {
      if (current.id === oldTaskId) {
        return false;
      }
      if (current.background && !current.parentId) {
        return true;
      }
      if (!current.parentId || visited.has(current.id)) {
        break;
      }
      visited.add(current.id);
      current = taskById.get(current.parentId);
    }
    return false;
  };
  const forkableTasks = tasks.filter((task) => !isBackgroundDescendant(task));

  const taskIdMap = new Map<string, string>();
  taskIdMap.set(oldTaskId, newTaskId);
  for (const task of forkableTasks) {
    if (!taskIdMap.has(task.id)) {
      taskIdMap.set(task.id, crypto.randomUUID());
    }
  }
  const getNewTaskId = (id: string) => {
    const newId = taskIdMap.get(id);
    if (!newId) {
      throw new Error("Task ID mapping error during fork task.");
    }
    return newId;
  };

  const newTasks = forkableTasks.map((task) => {
    // A fork copies the conversation, not the running executor or its tool
    // state. Keep background jobs visible without replaying their side effects.
    const interruptBackgroundTask =
      task.background &&
      (task.status === "pending-model" || task.status === "pending-tool");
    return task.id === oldTaskId
      ? {
          id: newTaskId,
          cwd: task.cwd ?? undefined,
          title: newTaskTitle,
          parentId: undefined,
          modelId: task.modelId ?? undefined,
          status: "pending-model" as const,
          git: task.git ?? undefined,
          createdAt: now,
        }
      : {
          id: getNewTaskId(task.id),
          cwd: task.cwd ?? undefined,
          title: task.title ?? undefined,
          parentId: task.parentId ? getNewTaskId(task.parentId) : undefined,
          background: task.background ?? undefined,
          modelId: task.modelId ?? undefined,
          status: interruptBackgroundTask ? ("failed" as const) : task.status,
          error: interruptBackgroundTask
            ? {
                kind: "AbortError" as const,
                message:
                  "Background subtask was interrupted when the task was forked.",
              }
            : (task.error ?? undefined),
          git: task.git ?? undefined,
          createdAt: now,
        };
  });

  const mainTaskMessages: DBMessageShape[] = [];
  const subTaskMessages: DBMessageShape[] = [];
  for (const message of messages) {
    if (message.taskId === oldTaskId) {
      mainTaskMessages.push(message as DBMessageShape);
    } else if (taskIdMap.has(message.taskId)) {
      // Skip messages that belong to tasks excluded from the fork (e.g. background tasks).
      subTaskMessages.push(message as DBMessageShape);
    }
  }
  const forkMainTaskMessages = truncateMessages(
    mainTaskMessages,
    commitId,
    messageId,
  );

  const newMessages = [...forkMainTaskMessages, ...subTaskMessages].map(
    (message) => ({
      id: message.id,
      taskId: getNewTaskId(message.taskId),
      data: replaceTaskIdInMessages(message.data, getNewTaskId, taskIdMap),
    }),
  );

  const newFiles = files.map((file) => ({
    content: file.content,
    filePath: file.filePath,
  }));

  return {
    tasks: newTasks,
    messages: newMessages,
    files: newFiles,
  };
};

const truncateMessages = (
  messages: readonly DBMessageShape[],
  commitId: string,
  messageId?: string | undefined,
) => {
  const resultMessages = [];
  if (messageId) {
    const messageIndex = messages.findIndex(
      (message) => message.id === messageId,
    );
    if (messageIndex < 0) {
      throw new Error(
        `Failed to fork task due to missing messageId ${messageId}`,
      );
    }
    resultMessages.push(...messages.slice(0, messageIndex + 1));
  } else {
    const messageIndex = messages.findIndex((message) =>
      message.data.parts.find(
        (part) =>
          part.type === "data-checkpoint" && part.data.commit === commitId,
      ),
    );
    if (messageIndex < 0) {
      throw new Error(
        `Failed to fork task due to missing checkpoint for commitId ${commitId}`,
      );
    }
    resultMessages.push(...messages.slice(0, messageIndex));
    const message = messages[messageIndex];
    const partIndex = message.data.parts.findIndex(
      (part) =>
        part.type === "data-checkpoint" && part.data.commit === commitId,
    );
    resultMessages.push({
      ...message,
      data: {
        ...message.data,
        parts: message.data.parts.slice(0, partIndex),
      },
    });
  }
  return resultMessages;
};

const replaceTaskIdInMessages = (
  message: DBMessageShape["data"],
  getNewTaskId: (id: string) => string,
  taskIdMap: ReadonlyMap<string, string>,
) => {
  const replaceBackgroundJobId = (id: string) => {
    const taskId = getSubAgentTaskId(id);
    const newTaskId = taskId ? taskIdMap.get(taskId) : undefined;
    return newTaskId ? getSubAgentBackgroundJobId(newTaskId) : id;
  };

  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === "tool-newTask") {
        const input = part.input?._meta?.uid
          ? {
              ...part.input,
              _meta: {
                ...part.input._meta,
                uid: getNewTaskId(part.input._meta.uid),
              },
            }
          : part.input;
        if (part.state === "output-available" && part.output.backgroundJobId) {
          const oldJobId = part.output.backgroundJobId;
          const newJobId = replaceBackgroundJobId(oldJobId);
          return {
            ...part,
            input,
            output: {
              ...part.output,
              backgroundJobId: newJobId,
              result: part.output.result.replaceAll(oldJobId, newJobId),
            },
          };
        }
        return { ...part, input };
      }
      if (
        part.type === "data-background-job-notification" &&
        part.data.kind === "subagent"
      ) {
        const newTaskId = taskIdMap.get(part.data.taskId);
        if (!newTaskId) return part;
        const oldJobId = getSubAgentBackgroundJobId(part.data.taskId);
        const newJobId = getSubAgentBackgroundJobId(newTaskId);
        return {
          ...part,
          data: {
            ...part.data,
            taskId: newTaskId,
            backgroundJobId: newJobId,
            notificationId: part.data.notificationId.replace(
              `${oldJobId}:`,
              `${newJobId}:`,
            ),
          },
        };
      }
      if (
        (part.type === "tool-killBackgroundJob" ||
          part.type === "tool-readBackgroundJobOutput") &&
        part.input?.backgroundJobId
      ) {
        return {
          ...part,
          input: {
            ...part.input,
            backgroundJobId: replaceBackgroundJobId(part.input.backgroundJobId),
          },
        };
      }
      return part;
    }),
  };
};
