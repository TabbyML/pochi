import type { TaskThreadSource } from "@/components/task-thread";
import { useCallback, useEffect, useRef, useState } from "react";

type SubtaskPreviewSource = TaskThreadSource & { parentId?: string };

export const SubtaskPreviewSourceThrottleMs = 300;

/**
 * Keeps the nested subtask preview responsive without publishing every source
 * update into the visible TaskThread. While the preview is collapsed, updates
 * are retained as the latest source but not rendered. When the preview is
 * opened or the subtask finishes, the latest source is published immediately;
 * otherwise running subtasks publish the latest source at a bounded cadence.
 */
export function useSubtaskPreviewSource<
  T extends SubtaskPreviewSource | undefined,
>(
  source: T,
  {
    throttleMs = SubtaskPreviewSourceThrottleMs,
    isExecuting,
    isPreviewVisible,
  }: {
    throttleMs?: number;
    isExecuting: boolean;
    isPreviewVisible: boolean;
  },
): T {
  const [visibleSource, setVisibleSource] = useState(source);
  const latestSourceRef = useRef(source);
  const publishTimerRef = useRef<number | undefined>(undefined);
  const wasPreviewVisibleRef = useRef(isPreviewVisible);

  const cancelScheduledPublish = useCallback(() => {
    if (publishTimerRef.current !== undefined) {
      window.clearTimeout(publishTimerRef.current);
      publishTimerRef.current = undefined;
    }
  }, []);

  const publishLatestSource = useCallback(() => {
    cancelScheduledPublish();
    setVisibleSource(latestSourceRef.current);
  }, [cancelScheduledPublish]);

  useEffect(() => () => cancelScheduledPublish(), [cancelScheduledPublish]);

  useEffect(() => {
    latestSourceRef.current = source;

    if (!isPreviewVisible) {
      cancelScheduledPublish();
      wasPreviewVisibleRef.current = false;
      return;
    }

    if (!wasPreviewVisibleRef.current) {
      wasPreviewVisibleRef.current = true;
      publishLatestSource();
      return;
    }

    if (!isExecuting) {
      publishLatestSource();
      return;
    }

    if (visibleSource === undefined) {
      publishLatestSource();
      return;
    }

    if (source === visibleSource) {
      return;
    }

    if (publishTimerRef.current !== undefined) {
      return;
    }

    publishTimerRef.current = window.setTimeout(() => {
      publishTimerRef.current = undefined;
      setVisibleSource(latestSourceRef.current);
    }, throttleMs);
  }, [
    source,
    isPreviewVisible,
    isExecuting,
    throttleMs,
    visibleSource,
    cancelScheduledPublish,
    publishLatestSource,
  ]);

  return visibleSource as T;
}
