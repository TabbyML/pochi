import { taskCatalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { useMemo } from "react";

interface DeletedWorktreesOptions {
  cwd: string;
  origin?: string | null;
  activeWorktrees?: { path: string }[];
}
export function useDeletedWorktrees({
  cwd,
  origin,
  activeWorktrees,
}: DeletedWorktreesOptions) {
  const { store } = useStore();

  const worktreeQuery = useMemo(() => {
    return taskCatalog.queries.makeNonCwdWorktreesQuery(cwd, origin ?? "");
  }, [cwd, origin]);
  const worktrees = store.useQuery(worktreeQuery);
  const deletedWorktrees = useMemo(
    () =>
      worktrees.filter(
        (wt) => !activeWorktrees?.some((active) => active.path === wt.path),
      ),
    [worktrees, activeWorktrees],
  );
  return { deletedWorktrees };
}
