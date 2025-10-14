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
  () => tables.tasks.where("parentId", "=", null).orderBy("createdAt", "desc"),
  {
    label: "tasks",
  },
);

export const makeTasksQuery = (cwd: string) =>
  queryDb(
    {
      query: sql`select * from tasks where parentId is null and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') order by updatedAt desc`,
      schema: Schema.Array(tables.tasks.rowSchema),
    },
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

export const makeBlobQuery = (checksum: string) =>
  queryDb(
    () => tables.blobs.where("checksum", "=", checksum).first(undefined),
    {
      label: "blobs",
      deps: [checksum],
    },
  );
