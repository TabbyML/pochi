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
  countPendingSyncEvents,
  readSyncStatus,
  syncChannelName,
  syncTaskMessages,
} from "../sync";

export type SyncStatus = {
  state: "synced" | "syncing" | "offline";
  isLoading: boolean;
  pending: number;
  error: string | null;
};

type Snapshot = {
  store: LiveKitStore;
  connected?: boolean;
  connectionReady?: boolean;
  pagePending?: number;
  pageHead?: number;
  summary?: { pending: number; localHead: number };
  networkError?: string | null;
  sessionError?: string | null;
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
        Stream.concat(
          Stream.fromEffect(syncProcessor.syncState),
          syncProcessor.syncState.changes,
        ),
        (session) =>
          update({
            pagePending: countPendingSyncEvents(session.pending),
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
              summary: { pending: status.pending, localHead: status.localHead },
              connected: status.isConnected,
              ...(status.isConnected && status.pending === 0
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
    // The current SDK exposes only full leader syncState. Read it on demand
    // while the menu is visible, at most once every five seconds.
    const fiber = Effect.runFork(
      refresh().pipe(
        Effect.timeout("5 seconds"),
        // A slow status RPC does not mean the upload failed. Try again later.
        Effect.catchTag("TimeoutException", () => Effect.void),
        Effect.catchAllCause((cause) => {
          if (active && !Cause.isInterruptedOnly(cause))
            update({ error: Cause.pretty(cause) });
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
    try {
      // Keep waiting for confirmation; upload retries/backoff belong to the SDK.
      // There is no overall timeout here. Unmount/store changes cancel the wait.
      await Effect.runPromise(
        Effect.gen(function* () {
          // Read fresh pending before deciding whether a full resend is needed.
          const initial = yield* refresh();
          if (initial.pending === 0) syncTaskMessages(store, taskId);
          while (true) {
            const status = yield* refresh();
            if (status.isConnected && status.pending === 0) return;
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
      if (!controller.signal.aborted) update({ error: String(error) });
      throw error;
    } finally {
      if (request.current === controller) request.current = undefined;
      setRequesting((previous) => (previous === store ? undefined : previous));
    }
  }, [store, taskId, refresh, update]);

  const current = snapshot.store === store ? snapshot : undefined;
  const ahead = current?.summary
    ? Math.max(0, (current.pageHead ?? 0) - current.summary.localHead)
    : 0;
  const pending = Math.max(
    current?.pagePending ?? 0,
    (current?.summary?.pending ?? 0) + ahead,
  );
  const error =
    current?.networkError ?? current?.sessionError ?? current?.error ?? null;
  const state: SyncStatus["state"] =
    error || current?.connected === false
      ? "offline"
      : requesting === store || !current?.summary || pending > 0
        ? "syncing"
        : "synced";
  return {
    state,
    isLoading: !error && (!current?.summary || !current.connectionReady),
    pending,
    error,
    sync,
    isRequesting: requesting === store,
  };
}
