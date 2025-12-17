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

/**
 * Limit-based query for reactive pagination
 * The limit increases dynamically (10, 20, 30, etc.) as user scrolls
 * This ensures livestore can reactively update all loaded items
 */
export const makeTasksWithLimitQuery = (cwd: string, limit: number) => {
  return queryDb(
    {
      query: sql`select * from tasks where parentId is null and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') order by updatedAt desc limit ${limit}`,
      schema: Schema.Array(tables.tasks.rowSchema),
    },
    {
      label: "tasks.cwd.limit",
      deps: [cwd, limit],
    },
  );
};

/**
 * Count query to get total number of tasks for pagination
 * Returns the total count of tasks matching the cwd filter
 */
export const makeTasksCountQuery = (cwd: string) => {
  return queryDb(
    {
      query: sql`select COUNT(*) as count from tasks where parentId is null and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%')`,
      schema: Schema.Array(Schema.Struct({ count: Schema.Number })),
    },
    {
      label: "tasks.cwd.count",
      deps: [cwd],
    },
  );
};
