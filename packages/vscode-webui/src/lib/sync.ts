import { type LiveKitStore, catalog } from "@getpochi/livekit";
import type { SyncBackend } from "@livestore/common";
import { StoreInternalsSymbol } from "@livestore/livestore";
import { Effect, Socket, Stream } from "@livestore/utils/effect";

export const syncChannelName = (storeId: string) => `pochi-sync:${storeId}`;

/**
 * Re-send only the selected user task's messages with the same ids.
 * Called from the share menu, which is not exposed for local memory forks.
 */
export function syncTaskMessages(store: LiveKitStore, taskId: string) {
  const events = store
    .query(catalog.queries.makeMessagesQuery(taskId))
    .map(({ data }) => catalog.events.messageUpserted({ taskId, data }));
  if (events.length) store.commit(...events);
}

/** Client-only events can remain pending locally but never need cloud acknowledgement. */
export function countPendingSyncEvents(
  pending: ReadonlyArray<{ name: string }>,
) {
  return pending.filter(
    (event) =>
      !catalog.schema.eventsDefsMap.get(event.name)?.options.clientOnly,
  ).length;
}

/** Read only on demand: the SDK transfers full pending bodies over this RPC. */
export function readSyncStatus(store: LiveKitStore) {
  return Effect.gen(function* () {
    const { clientSession, syncProcessor } = store[StoreInternalsSymbol];
    const leader = yield* clientSession.leaderThread.syncState;
    const session = yield* syncProcessor.syncState;
    const network = yield* clientSession.leaderThread.networkStatus;
    // Include page events that were committed after the leader snapshot was read.
    const ahead = Math.max(
      0,
      session.localHead.global - leader.localHead.global,
    );
    return {
      isConnected: network.isConnected,
      pending: Math.max(
        countPendingSyncEvents(session.pending),
        countPendingSyncEvents(leader.pending) + ahead,
      ),
      localHead: session.localHead.global,
    };
  });
}

/** Observe real upload failures in our worker without modifying LiveStore. */
export function observeSyncBackend<T>(
  backend: SyncBackend.SyncBackend<T>,
  storeId: string,
) {
  return Effect.gen(function* () {
    const channel = yield* Effect.acquireRelease(
      Effect.sync(() => new BroadcastChannel(syncChannelName(storeId))),
      (channel) => Effect.sync(() => channel.close()),
    );
    let lastError: string | null = null;
    let isConnecting = true;
    let pushedHead:
      | { seqNum: number; clientId: string; sessionId: string }
      | undefined;
    const publish = (error: string | null) => {
      lastError = error;
      channel.postMessage({ type: "sync-status", error, isConnecting });
    };
    channel.onmessage = (event) => {
      if (event.data?.type === "get-sync-status") publish(lastError);
    };
    return {
      ...backend,
      // isConnected starts false while the SDK's first health check is pending.
      // Its completion distinguishes initialization from an offline backend.
      connect: backend.connect.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            isConnecting = false;
            publish(lastError);
          }),
        ),
      ),
      pull: (...args: Parameters<typeof backend.pull>) =>
        backend.pull(...args).pipe(
          Stream.tap(({ batch }) =>
            Effect.sync(() => {
              // A pull echo can confirm the upload and interrupt push before its
              // success callback. Match the batch tail, not unrelated/partial pulls.
              if (
                lastError &&
                pushedHead &&
                batch.some(
                  ({ eventEncoded }) =>
                    eventEncoded.seqNum === pushedHead?.seqNum &&
                    eventEncoded.clientId === pushedHead.clientId &&
                    eventEncoded.sessionId === pushedHead.sessionId,
                )
              ) {
                publish(null);
              }
            }),
          ),
        ),
      push: (batch: Parameters<typeof backend.push>[0]) =>
        Effect.suspend(() => {
          const head = batch.at(-1);
          // Keep only identity fields; retries after rebasing may have a new head.
          pushedHead = head && {
            seqNum: head.seqNum,
            clientId: head.clientId,
            sessionId: head.sessionId,
          };
          return backend.push(batch);
        }).pipe(
          Effect.tap(() => Effect.sync(() => publish(null))),
          Effect.tapError((error) =>
            Effect.sync(() => {
              // Disconnects belong to networkStatus; ServerAhead is normal rebasing.
              if (error._tag === "IsOfflineError") return;
              if (error._tag === "InvalidPushError") {
                if (error.cause._tag === "ServerAheadError") return;
                if (error.cause._tag === "LiveStore.UnknownError") {
                  // The WebSocket backend wraps socket failures in an RPC error.
                  const cause = error.cause.cause;
                  if (
                    typeof cause === "object" &&
                    cause !== null &&
                    "_tag" in cause &&
                    cause._tag === "RpcClientError" &&
                    "cause" in cause &&
                    Socket.isSocketError(cause.cause)
                  )
                    return;
                }
              }
              publish(String(error));
            }),
          ),
        ),
    };
  });
}
