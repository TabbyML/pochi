import { useMemo } from "react";

interface Options {
  cwd: string;
  excludeWorktrees: { path: string }[];
  isLoading: boolean;
}
import { useTasks } from "../use-tasks";

export function useDeletedWorktrees({
  cwd,
  excludeWorktrees,
  isLoading,
}: Options) {
  const excludeWorktreePaths = useMemo(
    () => excludeWorktrees?.map((wt) => wt.path) ?? [],
    [excludeWorktrees],
  );

  const tasks = useTasks().filter(
    (t) =>
      t.parentId === null &&
      t.git?.worktree?.gitdir.startsWith(`${cwd}/.git/worktrees`),
  );

  const worktrees = new Set<string>();
  for (const task of tasks) {
    if (task.cwd && !excludeWorktreePaths.includes(task.cwd)) {
      worktrees.add(task.cwd);
    }
  }

  const deletedWorktrees = Array.from(worktrees)
    .map((path) => ({ path }))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (isLoading) {
    return [];
  }

  return deletedWorktrees;
}
