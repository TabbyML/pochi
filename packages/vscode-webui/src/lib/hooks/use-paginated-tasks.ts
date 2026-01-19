import type { Task } from "@getpochi/livekit";
import { useCallback, useState } from "react";

interface UsePaginatedTasksOptions {
  cwd: string;
  pageSize?: number;
}

interface PaginatedTasksResult {
  tasks: readonly Task[];
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => void;
  reset: () => void;
}

/**
 * Hook for limit-based paginated task loading
 * Uses dynamic limit that increases as user scrolls (10, 20, 30, etc.)
 *
 * Design principles:
 * - Single reactive query with increasing limit
 * - Livestore automatically updates all loaded items
 * - Simpler state management than cursor-based pagination
 * - Ensures reactive updates for task status changes (e.g., "Planning next move")
 */
import { useTasks } from "../use-tasks";

export function usePaginatedTasks({
  cwd,
  pageSize = 10,
}: UsePaginatedTasksOptions): PaginatedTasksResult {
  const [limit, setLimit] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const tasks = useTasks()
    .filter((t) => t.parentId === null && t.cwd === cwd)
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
