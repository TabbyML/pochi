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

export const tasks$ = queryDb(
  () => tables.tasks.where("parentId", "=", null).orderBy("createdAt", "desc"),
  {
    label: "tasks",
  },
);

export const makeTasksQuery = (cwd: string) =>
  queryDb(
    () =>
      tables.tasks
        .where("parentId", "=", null)
        .where("cwd", "=", cwd)
        .orderBy("updatedAt", "desc"),
    {
      label: "tasks.cwd",
      deps: [cwd],
    },
  );

export const makeSubTaskQuery = (taskId: string) =>
  queryDb(() => tables.tasks.where("parentId", "=", taskId), {
    label: "subTasks",
    deps: [taskId],
  });
