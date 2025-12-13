import { Schema, queryDb, sql } from "@livestore/livestore";
import { tables } from "./default-schema";

export const makeTasksQuery = (
  cwd: string,
  page = 1,
  pageSize = 10,
  path = "",
) => {
  const offset = (page - 1) * pageSize;

  let filterCondition = "";
  if (path) {
    filterCondition = `and (git->>'$.worktree.gitdir' = '${path}/.git')`;
  }

  const queryStr = `
    SELECT * FROM tasks 
    WHERE parentId is null 
      and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
      ${filterCondition}
    ORDER BY createdAt desc 
    LIMIT ${pageSize} 
    OFFSET ${offset}
  `;

  return queryDb(
    {
      // 返回 tasks 数组
      query: sql`${queryStr}`,
      schema: Schema.Array(tables.tasks.rowSchema),
    },
    {
      label: "tasks.cwd.paginated",
      deps: [cwd, page, pageSize, path],
    },
  );
};

export const makeTasksCountQuery = (cwd: string, path = "") => {
  let filterCondition = "";
  if (path) {
    filterCondition = `and (git->>'$.worktree.gitdir' = '${path}/.git')`;
  }

  return queryDb(
    {
      query: sql`
        SELECT COUNT(*) as total FROM tasks 
        WHERE parentId is null 
          and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
          ${filterCondition}
      `,
      schema: Schema.Array(Schema.Struct({ total: Schema.Number })),
    },
    {
      label: "tasks.cwd.count",
      deps: [cwd, path],
    },
  );
};
