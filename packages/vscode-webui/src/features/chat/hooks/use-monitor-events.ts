import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import type { MonitorEventEnvelope } from "@getpochi/common";
import { effect } from "@preact/signals-core";
import { threadSignal } from "@quilted/threads/signals";
import { useEffect, useRef } from "react";

const logger = getLogger("UseMonitorEvents");

/**
 * Subscribes to the host's undelivered monitor event batches for a task
 * (startMonitor tool). Fresh batches are handed to `onEvents` exactly once
 * and acknowledged to the host so a webview reload doesn't redeliver them.
 */
export function useMonitorEvents(
  taskId: string,
  onEvents: (envelopes: MonitorEventEnvelope[]) => void,
) {
  const onEventsRef = useRef(onEvents);
  onEventsRef.current = onEvents;

  // Guards against redelivery while an ack roundtrip is in flight.
  const lastSeqRef = useRef(0);

  useEffect(() => {
    if (!isVSCodeEnvironment()) return;

    let disposed = false;
    let disposeEffect: (() => void) | undefined;

    (async () => {
      const serialized = await vscodeHost.readMonitorEvents(taskId);
      if (disposed) return;
      const events = threadSignal(serialized);
      disposeEffect = effect(() => {
        const envelopes = events.value;
        const fresh = envelopes.filter((e) => e.seq > lastSeqRef.current);
        if (fresh.length === 0) return;
        lastSeqRef.current = Math.max(...fresh.map((e) => e.seq));
        onEventsRef.current(fresh);
        vscodeHost
          .ackMonitorEvents(taskId, lastSeqRef.current)
          .catch((e) => logger.warn("Failed to ack monitor events", e));
      });
    })().catch((e) => logger.warn("Failed to read monitor events", e));

    return () => {
      disposed = true;
      disposeEffect?.();
    };
  }, [taskId]);
}
