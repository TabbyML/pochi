import type { LiveKitStore } from "@getpochi/livekit";
import { StoreInternalsSymbol } from "@livestore/livestore";
import {
  Cause,
  Effect,
  Fiber,
  Schedule,
  Stream,
} from "@livestore/utils/effect";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasPendingSyncEvents,
  readSyncStatus,
  syncChannelName,
  syncTaskMessages,
} from "../sync";

export type SyncStatus = {
  state: "synced" | "syncing" | "offline";
  isLoading: boolean;
  hasPending: boolean;
  error: string | null;
};

type Snapshot = {
  store: LiveKitStore;
  connected?: boolean;
  connectionReady?: boolean;
  // Once initial loading ends, retries must not bring the skeleton back for this store.
  initializationTimedOut?: boolean;
  statusTimedOut?: boolean;
  pageHasPending?: boolean;
  pageHead?: number;
  summary?: { hasPending: boolean; localHead: number };
  statusError?: string | null;
  networkError?: string | null;
  sessionError?: string | null;
  // A rejected resend does not change pending, so queue refreshes cannot clear it.
  requestError?: string | null;
  error: string | null;
};

export function useSyncStatus(
  store: LiveKitStore,
  { taskId, enabled = true }: { taskId?: string; enabled?: boolean } = {},
) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ store, error: null });
  const [requesting, setRequesting] = useState<LiveKitStore>();
  const currentStore = useRef(store);
  const request = useRef<AbortController | undefined>(undefined);
  const latestError = useRef<Pick<Snapshot, "store" | "error">>({
    store,
    error: null,
  });
  currentStore.current = store;

  const update = useCallback(
    (patch: Partial<Snapshot>) => {
      if (currentStore.current !== store) return;
      if (patch.error !== undefined)
        latestError.current = { store, error: patch.error };
      setSnapshot((previous) => ({
        ...(previous.store === store ? previous : { store, error: null }),
        ...patch,
        connectionReady:
          (previous.store === store && previous.connectionReady) ||
          patch.connected === true ||
          patch.connectionReady === true,
      }));
    },
    [store],
  );

  useEffect(() => {
    let active = true;
    const { clientSession, syncProcessor } = store[StoreInternalsSymbol];
    const watch = <T>(
      changes: Stream.Stream<T, unknown>,
      onValue: (value: T) => void,
      onError: (error: string) => void,
    ) =>
      Effect.runFork(
        changes.pipe(
          Stream.runForEach((value) =>
            Effect.sync(() => {
              if (active) onValue(value);
            }),
          ),
          Effect.catchAllCause((cause) => {
            if (Cause.isInterruptedOnly(cause)) return Effect.void;
            if (active) onError(Cause.pretty(cause));
            return Effect.fail(Cause.squash(cause));
          }),
          Effect.retry(Schedule.spaced("1 second")),
        ),
      );
    // Both of these streams are small or page-local. Do not subscribe to the
    // leader's full pending event bodies for an always-mounted toolbar icon.
    const fibers = [
      watch(
        clientSession.leaderThread.networkStatus.changes,
        (status) =>
          update({ connected: status.isConnected, networkError: null }),
        (error) => update({ networkError: error }),
      ),
      watch(
        // TODO: Share this single-consumer queue if multiple status views are mounted.
        Stream.concat(
          Stream.fromEffect(syncProcessor.syncState),
          syncProcessor.syncState.changes,
        ),
        (session) =>
          update({
            pageHasPending: hasPendingSyncEvents(session.pending),
            pageHead: session.localHead.global,
            sessionError: null,
          }),
        (error) => update({ sessionError: error }),
      ),
    ];
    const channel = new BroadcastChannel(syncChannelName(store.storeId));
    channel.onmessage = (event) => {
      if (
        event.data?.type === "sync-status" &&
        (event.data.error === null || typeof event.data.error === "string")
      ) {
        update({
          error: event.data.error,
          connectionReady: event.data.isConnecting === false,
        });
      }
    };
    channel.postMessage({ type: "get-sync-status" });
    return () => {
      active = false;
      channel.close();
      request.current?.abort();
      for (const fiber of fibers) Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [store, update]);

  const refresh = useCallback(
    () =>
      readSyncStatus(store).pipe(
        Effect.tap((status) =>
          Effect.sync(() =>
            update({
              summary: {
                hasPending: status.hasPending,
                localHead: status.localHead,
              },
              statusError: null,
              statusTimedOut: false,
              connected: status.isConnected,
              ...(status.isConnected && !status.hasPending
                ? { error: null }
                : {}),
            }),
          ),
        ),
      ),
    [store, update],
  );

  useEffect(() => {
    if (!enabled || requesting === store) return;
    let active = true;
    // Read the worker's small summary while the menu is visible.
    const fiber = Effect.runFork(
      refresh().pipe(
        Effect.timeout("5 seconds"),
        Effect.catchTag("TimeoutException", () =>
          Effect.sync(() =>
            update({
              statusError: null,
              statusTimedOut: true,
              initializationTimedOut: true,
            }),
          ),
        ),
        Effect.catchAllCause((cause) => {
          if (active && !Cause.isInterruptedOnly(cause))
            update({
              statusError: Cause.pretty(cause),
              initializationTimedOut: true,
            });
          return Effect.void;
        }),
        Effect.repeat(Schedule.spaced("5 seconds")),
      ),
    );
    return () => {
      active = false;
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [store, enabled, requesting, refresh, update]);

  const sync = useCallback(async () => {
    if (!taskId || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRequesting(store);
    update({ requestError: null });
    let queryFailed = false;
    const read = refresh().pipe(
      Effect.timeout("5 seconds"),
      Effect.tapError((error) =>
        Effect.sync(() => {
          queryFailed = true;
          update({
            statusError: Cause.isTimeoutException(error) ? null : String(error),
            statusTimedOut: Cause.isTimeoutException(error),
            initializationTimedOut: true,
          });
        }),
      ),
    );
    try {
      // Read fresh pending before deciding whether a full resend is needed.
      const initial = await Effect.runPromise(read, {
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      if (!initial.hasPending) syncTaskMessages(store, taskId);
      // Keep waiting for confirmation; upload retries/backoff belong to the SDK.
      // There is no overall timeout here. Unmount/store changes cancel the wait.
      await Effect.runPromise(
        Effect.gen(function* () {
          while (true) {
            // A slow status reply is not an upload failure; keep waiting.
            const status = yield* read.pipe(
              Effect.catchTag("TimeoutException", () =>
                Effect.succeed(undefined),
              ),
            );
            if (status?.isConnected && !status.hasPending) return;
            // Check after the fresh read, which can clear a cached worker error.
            // Only end this UI wait on failure; the SDK continues retrying.
            if (
              latestError.current.store === store &&
              latestError.current.error
            )
              return;
            yield* Effect.sleep("5 seconds");
          }
        }),
        { signal: controller.signal },
      );
    } catch (error) {
      if (!controller.signal.aborted && !queryFailed)
        update({
          requestError: error instanceof Error ? error.message : String(error),
        });
      throw error;
    } finally {
      if (request.current === controller) request.current = undefined;
      setRequesting((previous) => (previous === store ? undefined : previous));
    }
  }, [store, taskId, refresh, update]);

  const current = snapshot.store === store ? snapshot : undefined;
  const hasPending = Boolean(
    current?.pageHasPending ||
      current?.summary?.hasPending ||
      (current?.summary && (current.pageHead ?? 0) > current.summary.localHead),
  );
  const error =
    current?.requestError ??
    current?.networkError ??
    current?.sessionError ??
    current?.statusError ??
    current?.error ??
    null;
  const state: SyncStatus["state"] =
    error || (current?.connected === false && current.connectionReady)
      ? "offline"
      : requesting === store ||
          !current?.summary ||
          !current.connectionReady ||
          current.statusTimedOut ||
          hasPending
        ? "syncing"
        : "synced";
  const isLoading =
    !error &&
    !current?.initializationTimedOut &&
    (!current?.summary || !current.connectionReady);
  useEffect(() => {
    if (!enabled || !isLoading) return;
    const timer = setTimeout(
      () =>
        update({
          initializationTimedOut: true,
        }),
      5000,
    );
    return () => clearTimeout(timer);
  }, [enabled, isLoading, update]);
  return {
    state,
    isLoading,
    hasPending,
    error,
    sync,
    isRequesting: requesting === store,
  };
}
