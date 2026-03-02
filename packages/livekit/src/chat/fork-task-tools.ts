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

  const taskIdMap = new Map<string, string>();
  taskIdMap.set(oldTaskId, newTaskId);
  for (const task of tasks) {
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

  const newTasks = tasks.map((task) =>
    task.id === oldTaskId
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
          modelId: task.modelId ?? undefined,
          status: task.status,
          git: task.git ?? undefined,
          createdAt: now,
        },
  );

  const mainTaskMessages: DBMessageShape[] = [];
  const subTaskMessages: DBMessageShape[] = [];
  for (const message of messages) {
    if (message.taskId === oldTaskId) {
      mainTaskMessages.push(message as DBMessageShape);
    } else {
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
      data: replaceTaskIdInMessages(message.data, getNewTaskId),
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
) => {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === "tool-newTask" && part.input?._meta?.uid) {
        return {
          ...part,
          input: {
            ...part.input,
            _meta: {
              ...part.input._meta,
              uid: getNewTaskId(part.input._meta.uid),
            },
          },
        };
      }
      if (
        part.type === "tool-readBackgroundJobOutput" &&
        part.input?.backgroundJobId
      ) {
        try {
          const newTaskId = getNewTaskId(part.input.backgroundJobId);
          return {
            ...part,
            input: {
              ...part.input,
              backgroundJobId: newTaskId,
            },
          };
        } catch {
          // ignore, getNewTaskId failed when backgroundJobId is not a taskId
        }
      }
      return part;
    }),
  };
};
