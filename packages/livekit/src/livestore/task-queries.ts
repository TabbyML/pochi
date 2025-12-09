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

  return queryDb(
    {
      query: sql`select * from tasks where parentId is null and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') ${excludeCondition} order by updatedAt desc limit ${pageSize} offset ${offset}`,
      schema: Schema.Array(tables.tasks.rowSchema),
    },
    {
      label: "tasks.cwd.paginated",
      deps: [cwd, page, pageSize, ...excludedPaths],
    },
  );
};
