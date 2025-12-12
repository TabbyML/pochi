import { Schema, queryDb, sql } from "@livestore/livestore";
import { tables } from "./default-schema";

<<<<<<< HEAD
export const makeTasksQuery = (cwd: string, limit = 10, path = "") => {
  let filterCondition = "";
  if (path) {
    filterCondition = `and (git->>'$.worktree.gitdir' = '${path}/.git')`;
=======
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
>>>>>>> b12edf8bc (fetch task list by git branch; reverse use-worktrees;add i18n-key for taskpage loadingMore)
  }

  const queryStr = `
    SELECT * FROM tasks 
    WHERE parentId is null 
      and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
<<<<<<< HEAD
      ${filterCondition}
    ORDER BY createdAt desc
    LIMIT ${limit} 
=======
      ${branchCondition}
    ORDER BY createdAt desc 
    LIMIT ${pageSize} 
    OFFSET ${offset}
>>>>>>> b12edf8bc (fetch task list by git branch; reverse use-worktrees;add i18n-key for taskpage loadingMore)
  `;

  return queryDb(
    {
      // 返回 tasks 数组
      query: sql`${queryStr}`,
      schema: Schema.Array(tables.tasks.rowSchema),
    },
    {
      label: "tasks.cwd.paginated",
<<<<<<< HEAD
      deps: [cwd, limit, path],
=======
      deps: [cwd, page, pageSize, branch],
>>>>>>> b12edf8bc (fetch task list by git branch; reverse use-worktrees;add i18n-key for taskpage loadingMore)
    },
  );
};

<<<<<<< HEAD
export const makeTasksCountQuery = (cwd: string, path = "") => {
  let filterCondition = "";
  if (path) {
    filterCondition = `and (git->>'$.worktree.gitdir' = '${path}/.git')`;
=======
export const makeTasksCountQuery = (cwd: string, branch = "") => {
  let branchCondition = "";
  if (branch) {
    branchCondition = `and (git->>'$.branch' = '${branch}')`;
>>>>>>> b12edf8bc (fetch task list by git branch; reverse use-worktrees;add i18n-key for taskpage loadingMore)
  }

  return queryDb(
    {
      query: sql`
        SELECT COUNT(*) as total FROM tasks 
        WHERE parentId is null 
          and (cwd = '${cwd}' or git->>'$.worktree.gitdir' like '${cwd}/.git/worktrees%') 
<<<<<<< HEAD
          ${filterCondition}
=======
          ${branchCondition}
>>>>>>> b12edf8bc (fetch task list by git branch; reverse use-worktrees;add i18n-key for taskpage loadingMore)
      `,
      schema: Schema.Array(Schema.Struct({ total: Schema.Number })),
    },
    {
      label: "tasks.cwd.count",
<<<<<<< HEAD
      deps: [cwd, path],
=======
      deps: [cwd, branch],
>>>>>>> b12edf8bc (fetch task list by git branch; reverse use-worktrees;add i18n-key for taskpage loadingMore)
    },
  );
};
