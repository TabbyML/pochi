import { Schema, queryDb, sql } from "@livestore/livestore";
import { tables } from "./default-schema";

export const makeTasksQuery = (
  cwd: string,
  page = 1,
  pageSize = 10,
  excludedPaths: string[] = [],
) => {
  const offset = (page - 1) * pageSize;
  // 构建排除路径的条件
  let excludeCondition = "";
  if (excludedPaths.length > 0) {
    // 为每个路径创建排除条件：排除 cwd 匹配的路径，也排除 git worktree 目录匹配的路径
    const excludeConditions = excludedPaths.flatMap((path) => [
      `cwd != '${path}'`,
      `git->>'$.worktree.gitdir' not like '${path}/.git/worktrees/%'`,
    ]);
    excludeCondition = `and (${excludeConditions.join(" and ")})`;
  }

  const queryStr = `
    SELECT * FROM tasks 
    WHERE parentId is null 
      and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
      ${excludeCondition}
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
      deps: [cwd, page, pageSize, ...excludedPaths],
    },
  );
};

// 新增：获取总数的查询
export const makeTasksCountQuery = (
  cwd: string,
  excludedPaths: string[] = [],
) => {
  // 构建排除路径的条件
  let excludeCondition = "";
  if (excludedPaths.length > 0) {
    // 为每个路径创建排除条件：排除 cwd 匹配的路径，也排除 git worktree 目录匹配的路径
    const excludeConditions = excludedPaths.flatMap((path) => [
      `cwd != '${path}'`,
      `git->>'$.worktree.gitdir' not like '${path}/.git/worktrees/%'`,
    ]);
    excludeCondition = `and (${excludeConditions.join(" and ")})`;
  }

  return queryDb(
    {
      query: sql`
        SELECT COUNT(*) as total FROM tasks 
        WHERE parentId is null 
          and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
          ${excludeCondition}
      `,
      schema: Schema.Array(Schema.Struct({ total: Schema.Number })),
    },
    {
      label: "tasks.cwd.count",
      deps: [cwd, ...excludedPaths],
    },
  );
};
