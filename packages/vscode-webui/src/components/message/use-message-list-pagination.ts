import type { Message } from "@getpochi/livekit";
import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Paginates MessageList with a tail-aligned slice.
 * The newest messages remain mounted to preserve bottom anchoring.
 */
export const MessageListPaginationConfig = {
  /** Part budget for initial mount, reset, and each earlier-page load. */
  partBudget: 60,
  /** Minimum messages kept when one message exceeds the budget. */
  minInitialMessages: 2,
} as const;

export type MessageListPaginationConfigValue = {
  partBudget: number;
  minInitialMessages: number;
};

export interface MessageListPaginationState {
  /** Absolute index of the first mounted message; null recalculates it. */
  startIndex: number | null;
}

/** Loads when the top trigger enters view. */
const LoadEarlierRootMargin = "0px";

/** Walks backward within budget, except to satisfy minMessages. */
export function computePageStart(
  partCounts: number[],
  fromIndex: number,
  budget: number,
  minMessages: number,
): number {
  const upper = Math.min(fromIndex, partCounts.length);
  let start = Math.max(upper, 0);
  let used = 0;

  for (let i = upper - 1; i >= 0; i--) {
    const count = Math.max(partCounts[i] ?? 0, 0);
    const taken = upper - i - 1;
    if (used + count > budget && taken >= minMessages) {
      break;
    }
    used += count;
    start = i;
  }

  return start;
}

/** Keeps a valid start during streaming; invalid indices reset to the tail. */
export function resolvePageStart(
  state: MessageListPaginationState,
  partCounts: number[],
  config: MessageListPaginationConfigValue,
): number {
  const total = partCounts.length;
  if (total === 0) {
    return 0;
  }
  if (
    state.startIndex === null ||
    state.startIndex < 0 ||
    state.startIndex >= total
  ) {
    return computePageStart(
      partCounts,
      total,
      config.partBudget,
      config.minInitialMessages,
    );
  }
  return state.startIndex;
}

/** Loads one more part budget before the current page. */
export function loadEarlier(
  state: MessageListPaginationState,
  partCounts: number[],
  config: MessageListPaginationConfigValue,
): MessageListPaginationState {
  const current = resolvePageStart(state, partCounts, config);
  if (current === 0) {
    return { startIndex: 0 };
  }
  // Require progress only; the initial floor could load multiple huge messages.
  return {
    startIndex: computePageStart(partCounts, current, config.partBudget, 1),
  };
}

/** Recomputes the tail page on the next render. */
export function resetPaginationToTail(): MessageListPaginationState {
  return { startIndex: null };
}

export function useMessageListPagination({
  messages,
  containerRef,
  enabled = true,
  config = MessageListPaginationConfig,
}: {
  messages: Message[];
  containerRef?: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  config?: MessageListPaginationConfigValue;
}) {
  const paginationEnabled =
    enabled && typeof IntersectionObserver !== "undefined";
  const [state, setState] = useState<MessageListPaginationState>(
    resetPaginationToTail,
  );

  const partCounts = useMemo(
    () => messages.map((m) => m.parts.length),
    [messages],
  );
  const partCountsRef = useRef(partCounts);
  useEffect(() => {
    partCountsRef.current = partCounts;
  }, [partCounts]);

  const lastUserMessageId = messages.findLast(
    (message) => message.role === "user",
  )?.id;
  const previousLastUserMessageIdRef = useRef(lastUserMessageId);
  const shouldResetForNewUser =
    previousLastUserMessageIdRef.current !== lastUserMessageId;
  const effectiveState = shouldResetForNewUser
    ? resetPaginationToTail()
    : state;
  const start = paginationEnabled
    ? resolvePageStart(effectiveState, partCounts, config)
    : 0;

  // Persist the render-time reset after the tail page commits.
  useEffect(() => {
    previousLastUserMessageIdRef.current = lastUserMessageId;
    if (!paginationEnabled || messages.length === 0) return;
    setState((prev) =>
      shouldResetForNewUser || prev.startIndex === null
        ? { startIndex: start }
        : prev,
    );
  }, [
    paginationEnabled,
    lastUserMessageId,
    messages.length,
    shouldResetForNewUser,
    start,
  ]);

  // Preserve the bottom distance when prepending messages.
  const pendingBottomDistanceRef = useRef<number | null>(null);
  const loadPendingRef = useRef(false);

  const handleLoadEarlier = useCallback(() => {
    if (!paginationEnabled || loadPendingRef.current) return;
    const next = loadEarlier(
      { startIndex: start },
      partCountsRef.current,
      config,
    );
    if (next.startIndex === start) return;

    const container = containerRef?.current;
    if (container) {
      pendingBottomDistanceRef.current =
        container.scrollHeight - container.scrollTop;
    }
    loadPendingRef.current = true;
    setState(next);
  }, [paginationEnabled, start, config, containerRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: start triggers anchor restoration after loading earlier messages.
  useLayoutEffect(() => {
    loadPendingRef.current = false;
    const container = containerRef?.current;
    const distance = pendingBottomDistanceRef.current;
    if (!container || distance === null) return;
    pendingBottomDistanceRef.current = null;
    const targetScrollTop = container.scrollHeight - distance;
    container.scrollTop = targetScrollTop;
  }, [start, containerRef]);

  const loadEarlierTriggerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const trigger = loadEarlierTriggerRef.current;
    const root = containerRef?.current;
    if (!paginationEnabled || start === 0 || !trigger || !root) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((item) => item.isIntersecting);
        if (isVisible) {
          handleLoadEarlier();
        }
      },
      { root, rootMargin: LoadEarlierRootMargin },
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [paginationEnabled, start, containerRef, handleLoadEarlier]);

  return {
    start,
    hiddenAboveCount: start,
    loadEarlierTriggerRef,
  };
}
