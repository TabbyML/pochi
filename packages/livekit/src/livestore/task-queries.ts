import { Schema, queryDb, sql } from "@livestore/livestore";
import { tables } from "./default-schema";

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
