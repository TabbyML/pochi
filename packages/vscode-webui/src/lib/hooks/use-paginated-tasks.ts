import { taskCatalog } from "@getpochi/livekit";
import type { Task } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
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
export function usePaginatedTasks({
  cwd,
  pageSize = 10,
}: UsePaginatedTasksOptions): PaginatedTasksResult {
  const { store } = useStore();

  const [limit, setLimit] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Query with current limit - livestore will reactively update all items
  const tasks = store.useQuery(
    taskCatalog.queries.makeTasksWithLimitQuery(cwd, limit),
  );

  // Query to get total count of tasks
  const countResult = store.useQuery(
    taskCatalog.queries.makeTasksCountQuery(cwd),
  );
  const totalCount = countResult[0]?.count ?? 0;

  // Log query results for debugging
  console.log('[usePaginatedTasks]', {
    cwd,
    limit,
    tasksLoaded: tasks.length,
    totalCount,
    hasMore: tasks.length < totalCount,
  });

  const hasMore = tasks.length < totalCount;
  
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
    tasks,
    hasMore,
    isLoading: isLoadingMore,
    loadMore,
    reset,
  };
}
