import { taskCatalog } from "@getpochi/livekit";
import type { Task } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
 * Hook for cursor-based paginated task loading
 * Uses keyset pagination with (updatedAt, id) lexicographic ordering
 *
 * Design principles:
 * - Only one useQuery call (current page)
 * - Cursor stores current boundary, not array
 * - Pages accumulated in component state
 * - Simple and predictable loading state
 */
export function usePaginatedTasks({
  cwd,
  pageSize = 20,
}: UsePaginatedTasksOptions): PaginatedTasksResult {
  const { store } = useStore();

  // Current cursor (boundary of loaded data)
  const [cursor, setCursor] = useState<
    { updatedAt: number; id: string } | undefined
  >(undefined);

  // Accumulated pages
  const [pages, setPages] = useState<readonly Task[][]>([]);

  // Loading state
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Track if we're waiting for a new page to load
  const isWaitingForPage = useRef(false);

  // Query current page only (pageSize is ignored by query, it uses 10 for first, 20 for rest)
  const currentPage = store.useQuery(
    taskCatalog.queries.makeTasksPaginatedQuery(cwd, pageSize, cursor),
  );

  // When current page loads after cursor update, add it to pages and clear loading
  useEffect(() => {
    if (isWaitingForPage.current && currentPage.length > 0) {
      setPages((prev) => {
        // Check if this page is already added (avoid duplicates)
        const lastPage = prev[prev.length - 1];
        if (lastPage && lastPage[0]?.id === currentPage[0]?.id) {
          return prev;
        }
        return [...prev, [...currentPage]];
      });
      isWaitingForPage.current = false;
      setIsLoadingMore(false);
    }
  }, [currentPage]);

  // Calculate hasMore based on current page length
  // First page: 10 items, subsequent pages: 20 items
  const currentPageLength = currentPage.length;
  const expectedPageSize = cursor === undefined ? 10 : 20;
  const hasMore = currentPageLength === expectedPageSize;

  // Flatten all pages
  const allTasks = pages.flat();

  // Load more: update cursor to fetch next page
  const loadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isWaitingForPage.current) return;

    const lastTask = currentPage[currentPage.length - 1];
    if (!lastTask) return;

    setIsLoadingMore(true);
    isWaitingForPage.current = true;
    setPages((prev) => [...prev, [...currentPage]]);

    // Update cursor to next boundary - this will trigger a new query
    setCursor({
      updatedAt: new Date(lastTask.updatedAt).getTime(),
      id: lastTask.id,
    });
  }, [hasMore, isLoadingMore, currentPage]);

  // Reset pagination
  const reset = useCallback(() => {
    setCursor(undefined);
    setPages([]);
    setIsLoadingMore(false);
    isWaitingForPage.current = false;
  }, []);

  // Combine accumulated pages with current page
  const tasks =
    cursor === undefined ? currentPage : [...allTasks, ...currentPage];

  return {
    tasks,
    hasMore,
    isLoading: isLoadingMore,
    loadMore,
    reset,
  };
}
