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

export const makeTasksQuery = (date: Date) => {
  if (!date) {
    return tasks$;
  }

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return queryDb(
    {
      query: sql`SELECT * FROM tasks WHERE parentId IS NULL AND createdAt BETWEEN ? AND ? ORDER BY updatedAt DESC`,
      bindValues: [startOfDay.getTime(), endOfDay.getTime()],
      schema: Schema.Array(tables.tasks.rowSchema),
    },
    {
      label: "tasksByDate",
      deps: [startOfDay.getTime()],
    },
  );
};
