import { queryDb } from "@livestore/livestore";
import { tables } from "./schema";

export const makeTaskQuery = (taskId: string) =>
  queryDb(
    () =>
      tables.tasks.where("id", "=", taskId).first({ behaviour: "undefined" }),
    {
      label: "task",
      deps: [taskId],
    },
  );

export const makeMessagesQuery = (taskId: string) =>
  queryDb(() => tables.messages.where("taskId", "=", taskId), {
    label: "messages",
    deps: [taskId],
  });

export const makeTasksQuery = (cwd?: string) =>
  queryDb(
    () => {
      const q = tables.tasks
        .where("parentId", "=", null)
        .orderBy("updatedAt", "desc");
      return cwd ? q.where("cwd", "=", cwd) : q;
    },
    {
      label: "tasks",
      deps: [cwd],
    },
  );

export const makeSubTaskQuery = (taskId: string) =>
  queryDb(() => tables.tasks.where("parentId", "=", taskId), {
    label: "subTasks",
    deps: [taskId],
  });
