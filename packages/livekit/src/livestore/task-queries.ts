import { Schema, queryDb, sql } from "@livestore/livestore";
import { tables } from "./default-schema";

export const makeTasksQuery = (
  cwd: string,
  page = 1,
  pageSize = 10,
  branch = "",
) => {
  const offset = (page - 1) * pageSize;

  let branchCondition = "";
  if (branch) {
    branchCondition = `and (git->>'$.branch' = '${branch}')`;
  }

  const queryStr = `
    SELECT * FROM tasks 
    WHERE parentId is null 
      and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
      ${branchCondition}
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
      deps: [cwd, page, pageSize, branch],
    },
  );
};

export const makeTasksCountQuery = (cwd: string, branch = "") => {
  let branchCondition = "";
  if (branch) {
    branchCondition = `and (git->>'$.branch' = '${branch}')`;
  }

  return queryDb(
    {
      query: sql`
        SELECT COUNT(*) as total FROM tasks 
        WHERE parentId is null 
          and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
          ${branchCondition}
      `,
      schema: Schema.Array(Schema.Struct({ total: Schema.Number })),
    },
    {
      label: "tasks.cwd.count",
      deps: [cwd, branch],
    },
  );
};
