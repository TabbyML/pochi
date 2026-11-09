import { type LiveKitStore, catalog } from "@getpochi/livekit";
import { InvalidPushError, SyncBackend, UnknownError } from "@livestore/common";
import { LeaderThreadCtx } from "@livestore/common/leader-thread";
import { Schema, StoreInternalsSymbol } from "@livestore/livestore";
import {
  MAX_PUSH_EVENTS_PER_REQUEST,
  MAX_WS_MESSAGE_BYTES,
  splitChunkBySize,
} from "@livestore/sync-cf/common";
import {
  Cause,
  Chunk,
  Deferred,
  Effect,
  KeyValueStore,
  Option,
  Socket,
  Stream,
} from "@livestore/utils/effect";

export const syncChannelName = (storeId: string) => `pochi-sync:${storeId}`;

// Leave room for sequence numbers, client/session IDs and the authenticated
// transport envelope, which the worker adds after the event is committed.
const MaxResendEventBytes = MAX_WS_MESSAGE_BYTES - 16 * 1024;
const textEncoder = new TextEncoder();

/**
 * Re-send only the selected user task's messages with the same ids.
 * Called from the share menu, which is not exposed for local memory forks.
 */
export function syncTaskMessages(store: LiveKitStore, taskId: string) {
  const events = store
    .query(catalog.queries.makeMessagesQuery(taskId))
    .map(({ data }) => catalog.events.messageUpserted({ taskId, data }));
  // Validate the entire snapshot before committing any of it. A message may
  // have grown beyond the transport limit through separate compact events.
  for (const event of events) {
    const encoded = {
      name: event.name,
      args: Schema.encodeSync(catalog.events.messageUpserted.schema)(
        event.args,
      ),
    };
    const size = textEncoder.encode(JSON.stringify(encoded)).byteLength;
    if (size > MaxResendEventBytes) {
      throw new Error(
        `Cannot re-upload this task: message ${event.args.data.id} is too large (${size} bytes; limit ${MaxResendEventBytes} bytes). No messages were queued.`,
      );
    }
  }
  if (events.length) store.commit(...events);
}

/** Client-only events can remain pending locally but never need cloud acknowledgement. */
export function hasPendingSyncEvents(pending: ReadonlyArray<{ name: string }>) {
  return pending.some(
    (event) =>
      !catalog.schema.eventsDefsMap.get(event.name)?.options.clientOnly,
  );
}

type SyncSummary = {
  hasPending: boolean;
  localHead: number;
  isConnected: boolean;
};
/** Request only scalars over Pochi's channel, never the SDK's full-state RPC. */
function requestSyncSummary(storeId: string) {
  return Effect.scoped(
    Effect.gen(function* () {
      const channel = yield* Effect.acquireRelease(
        Effect.sync(() => new BroadcastChannel(syncChannelName(storeId))),
        (channel) => Effect.sync(() => channel.close()),
      );
      const requestId = crypto.randomUUID();
      return yield* Effect.async<SyncSummary, Error | Cause.TimeoutException>(
        (resume) => {
          channel.onmessage = ({ data }) => {
            if (
              data?.type !== "sync-status-summary" ||
              data.requestId !== requestId
            )
              return;
            if (data.timedOut === true)
              resume(
                Effect.fail(
                  new Cause.TimeoutException(
                    "Sync worker status query timed out",
                  ),
                ),
              );
            else if (typeof data.error === "string")
              resume(Effect.fail(new Error(data.error)));
            else if (
              typeof data.hasPending === "boolean" &&
              typeof data.isConnected === "boolean" &&
              Number.isSafeInteger(data.localHead) &&
              data.localHead >= 0
            )
              resume(
                Effect.succeed({
                  hasPending: data.hasPending,
                  isConnected: data.isConnected,
                  localHead: data.localHead,
                }),
              );
            else resume(Effect.fail(new Error("Invalid sync status response")));
          };
          channel.postMessage({ type: "read-sync-status", requestId });
        },
      );
    }),
  );
}

/** The worker returns only scalars, never pending events or changesets. */
export function readSyncStatus(store: LiveKitStore) {
  return Effect.gen(function* () {
    const { syncProcessor } = store[StoreInternalsSymbol];
    const leader = yield* requestSyncSummary(store.storeId);
    const session = yield* syncProcessor.syncState;
    // Include page events that were committed after the leader snapshot was read.
    return {
      isConnected: leader.isConnected,
      hasPending:
        leader.hasPending ||
        hasPendingSyncEvents(session.pending) ||
        session.localHead.global > leader.localHead,
      localHead: session.localHead.global,
    };
  });
}

/**
 * Keep per-request deadlines in Pochi, using the SDK's existing payload splitter.
 * The pinned SDK still uses unbounded exponential retry delays. These deadlines
 * release stalled attempts; they do not bound recovery time after repeated failures.
 */
export function withSyncPushTimeout<T>(
  makeBackend: SyncBackend.SyncBackendConstructor<T>,
): SyncBackend.SyncBackendConstructor<T> {
  return (args) =>
    Effect.gen(function* () {
      const backend = yield* makeBackend(args);
      const kv = yield* KeyValueStore.KeyValueStore;
      const readBackendId = SyncBackend.makeBackendIdHelper.pipe(
        Effect.provideService(KeyValueStore.KeyValueStore, kv),
      );
      return {
        ...backend,
        push: (batch: Parameters<typeof backend.push>[0]) =>
          Effect.gen(function* () {
            if (batch.length === 0) return;
            let backendId = (yield* readBackendId).get();
            const split = (items: typeof batch) =>
              Chunk.fromIterable(items).pipe(
                splitChunkBySize({
                  maxItems: MAX_PUSH_EVENTS_PER_REQUEST,
                  maxBytes: MAX_WS_MESSAGE_BYTES,
                  encode: (batch) => ({
                    storeId: args.storeId,
                    payload: args.payload,
                    batch,
                    backendId,
                  }),
                }),
                Effect.mapError((cause) => new UnknownError({ cause })),
              );
            let chunks = Array.from(yield* split(batch));
            while (chunks.length > 0) {
              const currentId = (yield* readBackendId).get();
              if (
                Option.getOrUndefined(currentId) !==
                Option.getOrUndefined(backendId)
              ) {
                backendId = currentId;
                // A pull may establish the backend ID between requests, changing framing size.
                chunks = Array.from(
                  yield* split(
                    chunks.flatMap((chunk) => Chunk.toReadonlyArray(chunk)),
                  ),
                );
              }
              const [chunk, ...remaining] = chunks;
              chunks = remaining;
              yield* backend.push(Chunk.toReadonlyArray(chunk)).pipe(
                Effect.timeout("30 seconds"),
                Effect.mapError((cause) =>
                  cause._tag === "TimeoutException"
                    ? new InvalidPushError({
                        cause: new UnknownError({ cause }),
                      })
                    : cause,
                ),
              );
            }
          }).pipe(
            Effect.catchTag("LiveStore.UnknownError", (cause) =>
              Effect.fail(new InvalidPushError({ cause })),
            ),
          ),
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
    const scope = yield* Effect.scope;
    const summaryReader = yield* Deferred.make<
      Effect.Effect<SyncSummary>,
      Error
    >();
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
      if (
        event.data?.type === "read-sync-status" &&
        typeof event.data.requestId === "string"
      ) {
        const requestId = event.data.requestId;
        const reply = (
          body: SyncSummary | { error: string } | { timedOut: true },
        ) =>
          Effect.sync(() =>
            channel.postMessage({
              type: "sync-status-summary",
              requestId,
              ...body,
            }),
          );
        Effect.runFork(
          summaryReader.pipe(
            Effect.flatten,
            // Leave time for this typed response to arrive before the page's 5s deadline.
            Effect.timeout("4 seconds"),
            Effect.matchCauseEffect({
              onSuccess: reply,
              onFailure: (cause) => {
                if (Cause.isInterruptedOnly(cause)) return Effect.void;
                const failure = Cause.failureOption(cause);
                return reply(
                  Option.isSome(failure) &&
                    Cause.isTimeoutException(failure.value)
                    ? { timedOut: true }
                    : { error: Cause.pretty(cause) },
                );
              },
            }),
            Effect.forkIn(scope),
          ),
        );
      }
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
        Stream.unwrap(
          Effect.gen(function* () {
            // The SDK runs backend pulls in its exported leader context, including offline boot.
            const context = yield* Effect.serviceOption(LeaderThreadCtx);
            if (Option.isSome(context)) {
              const { syncProcessor, networkStatus } = context.value;
              yield* Deferred.succeed(
                summaryReader,
                Effect.gen(function* () {
                  const state = yield* syncProcessor.syncState;
                  const network = yield* networkStatus;
                  return {
                    hasPending: hasPendingSyncEvents(state.pending),
                    localHead: state.localHead.global,
                    isConnected: network.isConnected,
                  };
                }),
              );
            } else
              yield* Deferred.fail(
                summaryReader,
                new Error(
                  "Sync status is unavailable outside the leader runtime",
                ),
              );
            return backend.pull(...args);
          }),
        ).pipe(
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
