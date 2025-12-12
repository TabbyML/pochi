import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useWorktrees = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["worktrees"],
    queryFn: fetchWorktrees,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    worktrees: data?.worktrees.value,
    gh: data?.gh.value,
    gitOriginUrl: data?.gitOriginUrl,
    isLoading,
  };
};

async function fetchWorktrees() {
  const result = await vscodeHost.readWorktrees();
  return {
    worktrees: threadSignal(result.worktrees),
    gh: threadSignal(result.gh),
    gitOriginUrl: result.gitOriginUrl,
  };
}

export function useOptimisticWorktreeDelete() {
  const { worktrees } = useWorktrees();
  const [deletingMap, setDeletingMap] = useState<Map<string, number>>(
    new Map(),
  );

  // Clean up deletingMap after successful deletion or when path reappears (new worktree created)
  useEffect(() => {
    if (deletingMap.size === 0) return;

    const currentWorktreePaths = new Set(worktrees?.map((wt) => wt.path) || []);
    let hasChanges = false;
    const updatedMap = new Map(deletingMap);
    for (const [path, timestamp] of deletingMap) {
      const stillExists = currentWorktreePaths.has(path);

      if (!stillExists) {
        // Path no longer exists - deletion completed successfully
        updatedMap.delete(path);
        hasChanges = true;
      } else if (timestamp > 0) {
        // Only check elapsed time if timestamp was set (after deletion promise resolved)
        const elapsedTime = Date.now() - timestamp;
        if (elapsedTime > 5000) {
          // If still exists after 5 seconds, assume it's a new worktree or deletion failed
          updatedMap.delete(path);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      setDeletingMap(updatedMap);
    }
  }, [worktrees, deletingMap]);

  const deleteWorktree = (wt: string) => {
    // Mark as deleting immediately (with timestamp 0 as placeholder)
    setDeletingMap((prev) => new Map(prev).set(wt, 0));

    vscodeHost
      .deleteWorktree(wt)
      .then((success) => {
        if (success) {
          // Start 5-second timer after successful deletion
          setDeletingMap((prev) => new Map(prev).set(wt, Date.now()));
        } else {
          // If deletion failed, immediately remove from deleting state
          setDeletingMap((prev) => {
            const next = new Map(prev);
            next.delete(wt);
            return next;
          });
        }
      })
      .catch(() => {
        // Remove from deleting state on error
        setDeletingMap((prev) => {
          const next = new Map(prev);
          next.delete(wt);
          return next;
        });
      });
  };

  // Convert Map to Set for backward compatibility
  const deletingWorktreePaths = useMemo(
    () => new Set(deletingMap.keys()),
    [deletingMap],
  );

  return { deletingWorktreePaths, deleteWorktree };
}
