import { taskCatalog } from "@getpochi/livekit";
import { useMemo } from "react";

interface Options {
  cwd: string;
  excludeWorktrees: { path: string }[];
  isLoading: boolean;
}
import { useTaskStore } from "../use-task-store";

export function useDeletedWorktrees({
  cwd,
  excludeWorktrees,
  isLoading,
}: Options) {
  const store = useTaskStore();

  const excludeWorktreePaths = useMemo(
    () => excludeWorktrees?.map((wt) => wt.path) ?? [],
    [excludeWorktrees],
  );

  const deletedWorktrees = store.useQuery(
    taskCatalog.queries.makeDeletedWorktreesQuery(cwd, excludeWorktreePaths),
  );

  if (isLoading) {
    return [];
  }

  return deletedWorktrees;
}
