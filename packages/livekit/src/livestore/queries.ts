import { Schema, queryDb, sql } from "@livestore/livestore";
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
  {
    query: sql`select * from tasks where parentId is null order by updatedAt desc`,
    schema: Schema.Array(tables.tasks.rowSchema),
  },
  {
    label: "tasks",
  },
);

export const makeSubTaskQuery = (taskId: string) =>
  queryDb(() => tables.tasks.where("parentId", "=", taskId), {
    label: "subTasks",
    deps: [taskId],
  });
