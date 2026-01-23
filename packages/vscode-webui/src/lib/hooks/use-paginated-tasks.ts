import type { Task } from "@getpochi/livekit";
import { useCallback, useState } from "react";
import { useTasks } from "../use-tasks";
import { useTaskArchived } from "./use-task-archived";

interface UsePaginatedTasksOptions {
  cwd: string;
  pageSize?: number;
  showArchived?: boolean;
}

interface PaginatedTasksResult {
  tasks: readonly Task[];
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => void;
  reset: () => void;
}

export function usePaginatedTasks({
  cwd,
  pageSize = 10,
  showArchived,
}: UsePaginatedTasksOptions): PaginatedTasksResult {
  const [limit, setLimit] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { isTaskArchived } = useTaskArchived();

  const tasks = useTasks()
    .filter(
      (t) =>
        t.parentId === null &&
        t.cwd === cwd &&
        !!t.title?.trim() &&
        (showArchived || !isTaskArchived(t.id)),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const paginatedTasks = tasks.slice(0, limit);
  const hasMore = paginatedTasks.length < tasks.length;

  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    // Increase limit by pageSize (e.g., 10 -> 20 -> 30)
    setLimit((prev) => prev + pageSize);
    setTimeout(() => setIsLoadingMore(false), 300);
  }, [hasMore, isLoadingMore, pageSize]);

  // Reset pagination
  const reset = useCallback(() => {
    setLimit(pageSize);
    setIsLoadingMore(false);
  }, [pageSize]);

  return {
    tasks: paginatedTasks,
    hasMore,
    isLoading: isLoadingMore,
    loadMore,
    reset,
  };
}
