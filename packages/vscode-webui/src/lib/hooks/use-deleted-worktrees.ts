import { taskCatalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { useMemo } from "react";

interface Options {
  cwd: string;
  excludeWorktrees: { path: string }[];
}
export function useDeletedWorktrees({ cwd, excludeWorktrees }: Options) {
  const { store } = useStore();

  const excludeWorktreePaths = useMemo(
    () => excludeWorktrees?.map((wt) => wt.path) ?? [],
    [excludeWorktrees],
  );

  const deletedWorktrees = store.useQuery(
    taskCatalog.queries.makeDeletedWorktreesQuery(cwd, excludeWorktreePaths),
  );

  return { deletedWorktrees };
}
