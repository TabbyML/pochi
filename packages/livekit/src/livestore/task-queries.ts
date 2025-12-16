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
 * Cursor-based paginated query for tasks
 * Uses keyset pagination with (updatedAt, id) lexicographic ordering
 *
 * This ensures strict total ordering without duplicates or gaps:
 * - Tasks are ordered by (updatedAt DESC, id DESC)
 * - The condition: (updatedAt < cursor.updatedAt) OR (updatedAt = cursor.updatedAt AND id < cursor.id)
 * - First page loads 10 items, subsequent pages load 20 items
 *
 * @param cwd - Current working directory
 * @param limit - Number of tasks to fetch (ignored, calculated based on cursor)
 * @param cursor - Pagination cursor with updatedAt and id from last task
 */
export const makeTasksPaginatedQuery = (
  cwd: string,
  limit: number,
  cursor?: { updatedAt: number; id: string }
) => {
  
  const actualLimit = cursor === undefined ? 10 : limit;
  
  const cursorCondition = cursor
    ? sql`and (updatedAt < ${cursor.updatedAt} or (updatedAt = ${cursor.updatedAt} and id < '${cursor.id}'))`
    : sql``;

  return queryDb(
    {
      query: sql`
        select * from tasks
        where parentId is null
        and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%')
        ${cursorCondition}
        order by updatedAt desc, id desc
        limit ${actualLimit}
      `,
      schema: Schema.Array(tables.tasks.rowSchema),
    },
    {
      label: "tasks.cwd.paginated",
      deps: [cwd, actualLimit, cursor?.updatedAt, cursor?.id],
    }
  );
};
