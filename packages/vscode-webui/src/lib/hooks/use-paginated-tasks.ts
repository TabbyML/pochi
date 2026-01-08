import { taskCatalog } from "@getpochi/livekit";
import type { Task } from "@getpochi/livekit";
import { useCallback, useMemo, useState } from "react";

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
import { useTaskStore } from "../use-task-store";

export function usePaginatedTasks({
  cwd,
  pageSize = 10,
}: UsePaginatedTasksOptions): PaginatedTasksResult {
  const store = useTaskStore();

  const [limit, setLimit] = useState(pageSize);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const tasksQuery = useMemo(() => {
    return taskCatalog.queries.makeTasksWithLimitQuery(cwd, limit);
  }, [cwd, limit]);
  const countQuery = useMemo(() => {
    return taskCatalog.queries.makeTasksCountQuery(cwd);
  }, [cwd]);

  const tasks = store.useQuery(tasksQuery);

  // Query to get total count of tasks (cached by cwd)
  const countResult = store.useQuery(countQuery) ?? [];
  const totalCount = countResult[0]?.count ?? 0;
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
