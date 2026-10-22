import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { catalog, type Message } from "@getpochi/livekit";
import { EventSequenceNumber, Schema, StoreInternalsSymbol, createStorePromise } from "@livestore/livestore";
import { InvalidPushError, SyncBackend, UnknownError } from "@livestore/common";
import {
  Deferred,
  Duration,
  Effect,
  Option,
  Queue,
  Stream,
  SubscriptionRef,
} from "@livestore/utils/effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeSyncBackend,
  readSyncStatus,
  syncChannelName,
  syncTaskMessages,
} from "./sync";

const stores: Awaited<
  ReturnType<typeof createStorePromise<typeof catalog.schema>>
>[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.shutdownPromise()));
});
async function makeStore(backend?: SyncBackend.SyncBackendConstructor) {
  const store = await createStorePromise({
    storeId: crypto.randomUUID(),
    schema: catalog.schema,
    adapter: makeInMemoryAdapter({ sync: backend ? { backend } : undefined }),
    disableDevtools: true,
  });
  stores.push(store);
  return store;
}
const messages: Message[] = Array.from({ length: 8 }, (_, i) => ({
  id: `m-${i}`,
  role: "user",
  parts: [{ type: "text", text: `Message ${i}` }],
}));

describe("manual message sync", () => {
  it("resends one event per message, even when the task already exists", async () => {
    const store = await makeStore();
    // An existing log must still replay using the old aggregate event.
    store.commit(
      catalog.events.taskInited({
        id: "task",
        createdAt: new Date(),
        initMessages: messages,
      }),
    );
    const commit = vi.spyOn(store, "commit");
    syncTaskMessages(store, "task");
    syncTaskMessages(store, "task");
    expect(commit.mock.calls).toHaveLength(2);
    for (const events of commit.mock.calls) {
      expect(events).toHaveLength(messages.length);
      expect(events).toEqual(
        messages.map(() =>
          expect.objectContaining({ name: "v1.MessageUpserted" }),
        ),
      );
    }
    expect(
      store
        .query(catalog.queries.makeMessagesQuery("task"))
        .map((row) => row.data),
    ).toEqual(messages);
    expect(store.query(catalog.queries.makeTaskQuery("task"))?.status).toBe(
      "pending-model",
    );
  });

  it("updates a message without moving it behind newer messages", async () => {
    const store = await makeStore();
    store.commit(
      catalog.events.taskInited({
        id: "task",
        createdAt: new Date(),
        initMessages: messages,
      }),
    );
    const first = {
      ...messages[0],
      parts: [{ type: "text" as const, text: "Updated" }],
    };
    store.commit(
      catalog.events.messageUpserted({ taskId: "task", data: first }),
    );
    const rows = store.query(catalog.queries.makeMessagesQuery("task"));
    expect(rows.map((row) => row.id)).toEqual(
      messages.map((message) => message.id),
    );
    expect(rows[0].data).toEqual(first);
  });

  it("appends snapshot events without rejecting a large local message", async () => {
    const store = await makeStore();
    store.commit(
      catalog.events.taskInited({
        id: "task",
        createdAt: new Date(),
        initMessages: [
          messages[0],
          {
            ...messages[1],
            parts: [{ type: "text", text: "中文".repeat(300000) }],
          },
        ],
      }),
    );
    const commit = vi.spyOn(store, "commit");
    const before = store.query(catalog.queries.makeMessagesQuery("task"));
    expect(() => syncTaskMessages(store, "task")).not.toThrow();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]).toHaveLength(2);
    expect(store.query(catalog.queries.makeMessagesQuery("task"))).toEqual(
      before,
    );
  });

  it.each(["init", "fork"] as const)(
    "syncs split %s history and a repeated snapshot through two independent stores",
    async (source) => {
      const messages: Message[] = Array.from({ length: 3 }, (_, i) => ({
        id: `split-${i}`,
        role: "user",
        parts: [{ type: "text", text: "history".repeat(30000) }],
      }));
      const backend = makeRelayBackend();
      const local = await makeStore(backend);
      const cloud = await makeStore(backend);
      const createdAt = new Date();
      const batch =
        source === "init"
          ? catalog.taskInitEvents({
              id: "task",
              createdAt,
              initMessages: messages,
            })
          : catalog.forkTaskInitEvents({
              tasks: [
                {
                  id: "task",
                  createdAt,
                  status: "completed",
                  title: "Forked task",
                },
              ],
              messages: messages.map((data) => ({
                id: data.id,
                taskId: "task",
                data,
              })),
              files: [{ filePath: "/plan.md", content: "Forked plan" }],
            });
      local.commit(...batch);
      await vi.waitFor(() =>
        expect(
          cloud
            .query(catalog.queries.makeMessagesQuery("task"))
            .map((row) => row.id),
        ).toEqual(messages.map((message) => message.id)),
      );
      const updated = {
        ...messages[0],
        parts: [{ type: "text" as const, text: "Updated first message" }],
      };
      local.commit(
        catalog.events.messageUpserted({ taskId: "task", data: updated }),
      );
      syncTaskMessages(local, "task");
      const snapshotHead = (
        await Effect.runPromise(
          local[StoreInternalsSymbol].syncProcessor.syncState,
        )
      ).localHead.global;
      // Wait for the receiving store to apply the entire repeated snapshot,
      // not merely for the sender's upload to be acknowledged.
      await vi.waitFor(async () => {
        const remote = await Effect.runPromise(
          cloud[StoreInternalsSymbol].syncProcessor.syncState,
        );
        expect(remote.localHead.global).toBeGreaterThanOrEqual(snapshotHead);
        expect((await Effect.runPromise(readSyncStatus(local))).pending).toBe(
          0,
        );
      });
      expect(
        cloud
          .query(catalog.queries.makeMessagesQuery("task"))
          .map((row) => row.data),
      ).toEqual([updated, ...messages.slice(1)]);
      expect(cloud.query(catalog.queries.makeTaskQuery("task"))).toMatchObject({
        status: source === "init" ? "pending-model" : "completed",
        createdAt,
      });
      if (source === "fork") {
        expect(cloud.query(catalog.queries.makeTaskQuery("task"))?.title).toBe(
          "Forked task",
        );
        expect(
          cloud.query(catalog.queries.makeStoreFileQuery("/plan.md"))?.content,
        ).toBe("Forked plan");
      }
    },
  );
});

describe("worker upload failures", () => {
  it("reports when the initial connection attempt finishes even if still offline", async () => {
    const storeId = crypto.randomUUID();
    const channel = new BroadcastChannel(syncChannelName(storeId));
    const notifications: { error: string | null; isConnecting: boolean }[] = [];
    channel.onmessage = (event) => notifications.push(event.data);
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const connecting = yield* Deferred.make<void>();
            const backend = yield* observeSyncBackend(
              SyncBackend.of({
                isConnected: yield* SubscriptionRef.make(false),
                connect: connecting,
                ping: Effect.void,
                pull: () => Stream.empty,
                push: () => Effect.void,
                supports: { pullPageInfoKnown: true, pullLive: true },
                metadata: { name: "test", description: "Initial connection" },
              }),
              storeId,
            );
            yield* Effect.forkScoped(backend.connect);
            channel.postMessage({ type: "get-sync-status" });
            yield* Effect.promise(() => vi.waitFor(() =>
              expect(notifications.at(-1)).toMatchObject({
                error: null,
                isConnecting: true,
              }),
            ));
            yield* Deferred.succeed(connecting, undefined);
            yield* Effect.promise(() => vi.waitFor(() =>
              expect(notifications.at(-1)).toMatchObject({
                error: null,
                isConnecting: false,
              }),
            ));
          }),
        ),
      );
    } finally {
      channel.close();
    }
  });

  it("does not clear failures for partial, unrelated, or superseded push echoes", async () => {
    const storeId = crypto.randomUUID();
    const channel = new BroadcastChannel(syncChannelName(storeId));
    const notifications: (string | null)[] = [];
    channel.onmessage = (event) => notifications.push(event.data.error);
    const events: RelayedEvent[] = [1, 2, 3, 4].map((seqNum) => ({
      name: "v1.MessageUpserted",
      args: {},
      seqNum: EventSequenceNumber.Global.make(seqNum),
      parentSeqNum: EventSequenceNumber.Global.make(seqNum - 1),
      clientId: "client",
      sessionId: "session",
    }));
    let pulled: RelayedEvent[] = [];
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const backend = yield* observeSyncBackend(
              SyncBackend.of({
                isConnected: yield* SubscriptionRef.make(true),
                connect: Effect.void,
                ping: Effect.void,
                metadata: { name: "test", description: "Controlled pull echoes" },
                supports: { pullPageInfoKnown: true, pullLive: true },
                pull: () =>
                  Stream.make({
                    batch: pulled.map((eventEncoded) => ({
                      eventEncoded,
                      metadata: Option.none(),
                    })),
                    pageInfo: SyncBackend.pageInfoNoMore,
                  }),
                push: () =>
                  Effect.fail(
                    new InvalidPushError({
                      cause: new UnknownError({ cause: "Upload failed" }),
                    }),
                  ),
              }),
              storeId,
            );
            yield* backend.push(events.slice(0, 2)).pipe(Effect.either);
            yield* Effect.promise(() =>
              vi.waitFor(() => expect(notifications).toHaveLength(1)),
            );
            for (const batch of [
              [],
              [events[0]],
              [{ ...events[1], clientId: "other-client" }],
              [{ ...events[1], sessionId: "other-session" }],
            ]) {
              pulled = batch;
              yield* backend.pull(Option.none()).pipe(Stream.runDrain);
            }
            // A rebased retry has a new head; an older echo must not clear it.
            yield* backend.push(events.slice(2)).pipe(Effect.either);
            pulled = [events[1]];
            yield* backend.pull(Option.none()).pipe(Stream.runDrain);
            channel.postMessage({ type: "get-sync-status" });
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                expect(notifications).toHaveLength(3);
                expect(
                  notifications.every((error) => error?.includes("Upload failed")),
                ).toBe(true);
              }),
            );
            pulled = events.slice(2);
            yield* backend.pull(Option.none()).pipe(Stream.runDrain);
            yield* Effect.promise(() =>
              vi.waitFor(() => expect(notifications.at(-1)).toBeNull()),
            );
          }),
        ),
      );
    } finally {
      channel.close();
    }
  });

  it("clears the cached failure when pull confirms a retry before push returns", async () => {
    let attempts = 0;
    let interrupted = false;
    const store = await makeStore(({ storeId }) =>
      Effect.gen(function* () {
        const incoming = yield* Queue.unbounded<RelayedEvent>();
        return yield* observeSyncBackend(
          SyncBackend.of({
            isConnected: yield* SubscriptionRef.make(true),
            connect: Effect.void,
            ping: Effect.void,
            metadata: { name: "test", description: "Pull before PushAck" },
            supports: { pullPageInfoKnown: true, pullLive: true },
            pull: () =>
              Stream.concat(
                Stream.make(SyncBackend.pullResItemEmpty()),
                Stream.fromQueue(incoming).pipe(
                  Stream.map((event): SyncBackend.PullResItem => ({
                    batch: [{ eventEncoded: event, metadata: Option.none() }],
                    pageInfo: SyncBackend.pageInfoNoMore,
                  })),
                ),
              ),
            push: (batch) =>
              Effect.gen(function* () {
                attempts++;
                if (attempts === 1) {
                  return yield* new InvalidPushError({
                    cause: new UnknownError({ cause: "Temporary server error" }),
                  });
                }
                yield* Queue.offerAll(incoming, batch);
                // The real leader confirms the echo and interrupts this push.
                return yield* Effect.never.pipe(
                  Effect.onInterrupt(() =>
                    Effect.sync(() => {
                      interrupted = true;
                    }),
                  ),
                );
              }),
          }),
          storeId,
        );
      }),
    );
    const channel = new BroadcastChannel(syncChannelName(store.storeId));
    const notifications: (string | null)[] = [];
    channel.onmessage = (event) => notifications.push(event.data.error);
    try {
      store.commit(
        catalog.events.taskInited({ id: "task", createdAt: new Date() }),
      );
      await vi.waitFor(() =>
        expect(notifications[0]).toContain("Temporary server error"),
      );
      await vi.waitFor(
        async () => {
          expect(await Effect.runPromise(readSyncStatus(store))).toMatchObject({
            isConnected: true,
            pending: 0,
          });
          expect(interrupted).toBe(true);
        },
        { timeout: 5000 },
      );
      expect(attempts).toBe(2);
      await vi.waitFor(() => expect(notifications.at(-1)).toBeNull());
      const previous = notifications.length;
      channel.postMessage({ type: "get-sync-status" });
      await vi.waitFor(() => {
        expect(notifications).toHaveLength(previous + 1);
        expect(notifications.at(-1)).toBeNull();
      });
    } finally {
      channel.close();
    }
  });

  it("reports real failures and recovery without adding retries", async () => {
    const storeId = crypto.randomUUID();
    const channel = new BroadcastChannel(syncChannelName(storeId));
    const notifications: (string | null)[] = [];
    channel.onmessage = (event) => notifications.push(event.data.error);
    let fail = true;
    let attempts = 0;
    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const backend = yield* observeSyncBackend(
              SyncBackend.of({
                isConnected: yield* SubscriptionRef.make(true),
                connect: Effect.void,
                ping: Effect.void,
                pull: () => Stream.empty,
                supports: { pullPageInfoKnown: true, pullLive: true },
                metadata: { name: "test", description: "Test backend" },
                push: () =>
                  Effect.suspend(() => {
                    attempts++;
                    return fail
                      ? Effect.fail(
                          new InvalidPushError({
                            cause: new UnknownError({ cause: "Upload failed" }),
                          }),
                        )
                      : Effect.void;
                  }),
              }),
              storeId,
            );
            yield* backend.push([]).pipe(Effect.either);
            yield* Effect.promise(() =>
              vi.waitFor(() =>
                expect(notifications[0]).toContain("Upload failed"),
              ),
            );
            fail = false;
            yield* backend.push([]);
            yield* Effect.promise(() =>
              vi.waitFor(() => expect(notifications.at(-1)).toBeNull()),
            );
          }),
        ),
      );
      expect(attempts).toBe(2);
    } finally {
      channel.close();
    }
  });
});

type RelayedEvent = Parameters<SyncBackend.SyncBackend["push"]>[0][number];
function makeRelayBackend(pushed?: RelayedEvent[]) {
  type Event = Parameters<SyncBackend.SyncBackend["push"]>[0][number];
  const listeners = new Set<Queue.Queue<Event>>();
  const backend: SyncBackend.SyncBackendConstructor = () =>
    Effect.gen(function* () {
      const incoming = yield* Effect.acquireRelease(
        Queue.unbounded<Event>(),
        (queue) => Queue.shutdown(queue),
      );
      listeners.add(incoming);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          listeners.delete(incoming);
        }),
      );
      return SyncBackend.of({
        isConnected: yield* SubscriptionRef.make(true),
        connect: Effect.void,
        ping: Effect.void,
        metadata: { name: "test", description: "In-memory event relay" },
        supports: { pullPageInfoKnown: true, pullLive: true },
        pull: () =>
          Stream.concat(
            Stream.make(SyncBackend.pullResItemEmpty()),
            Stream.fromQueue(incoming).pipe(
              Stream.map((event) => ({
                batch: [{ eventEncoded: event, metadata: Option.none() }],
                pageInfo: SyncBackend.pageInfoNoMore,
              })),
            ),
          ),
        push: (batch) =>
          Effect.sync(() => pushed?.push(...batch)).pipe(
            Effect.andThen(
              Effect.forEach(listeners, (queue) =>
                Queue.offerAll(queue, batch),
              ),
            ),
            Effect.asVoid,
          ),
      });
    });
  return backend;
}

describe("local fork agent events", () => {
  it(
    "materializes and replays local events without uploading them or blocking the main task",
    async () => {
      const pushed: RelayedEvent[] = [];
      const backend = makeRelayBackend(pushed);
      const local = await makeStore(backend);
      const remote = await makeStore(backend);
      const replay = await makeStore();
      const createdAt = new Date(1234000);
      const response = {
        id: "answer",
        role: "assistant",
        parts: [],
        metadata: { kind: "assistant", totalTokens: 10 },
      } as unknown as Message;
      const batch = catalog.taskEvents(true, [
        ...catalog.taskInitEvents({
          id: "fork",
          createdAt,
          background: true,
          initMessages: messages,
        }),
        catalog.events.chatStreamStarted({
          id: "fork",
          data: messages[0],
          updatedAt: createdAt,
          todos: [],
        }),
        catalog.events.chatStreamFinished({
          id: "fork",
          data: response,
          status: "completed",
          updatedAt: createdAt,
          totalTokens: 10,
          duration: Duration.millis(42),
        }),
        catalog.events.toolsExecutionFinished({
          id: response.id,
          parts: [],
          duration: Duration.millis(5),
        }),
        catalog.events.inlineCompactAttached({
          id: messages[0].id,
          text: "Summary",
        }),
      ]);
      local.commit(...batch);
      // Persisted wrappers contain encoded business arguments, not live Date/Duration objects.
      for (const event of batch) {
        const definition = catalog.schema.eventsDefsMap.get(event.name)!;
        const encoded = JSON.parse(
          JSON.stringify(Schema.encodeSync(definition.schema)(event.args)),
        );
        replay.commit({
          name: event.name,
          args: Schema.decodeUnknownSync(definition.schema)(encoded),
        });
      }
      const taskQuery = catalog.queries.makeTaskQuery("fork");
      const messagesQuery = catalog.queries.makeMessagesQuery("fork");
      expect(local.query(taskQuery)).toMatchObject({
        status: "completed",
        createdAt,
        lastStepDuration: Duration.millis(42),
      });
      expect(local.query(messagesQuery)).toHaveLength(messages.length + 1);
      expect(replay.query(taskQuery)).toEqual(local.query(taskQuery));
      expect(replay.query(messagesQuery)).toEqual(local.query(messagesQuery));
      await vi.waitFor(async () =>
        expect((await Effect.runPromise(readSyncStatus(local))).pending).toBe(
          0,
        ),
      );
      local.commit(
        ...catalog.taskInitEvents({
          id: "main",
          createdAt,
          initMessages: [{ ...messages[0], id: "main-message" }],
        }),
      );
      local.commit(
        catalog.events.writeStoreFile({
          filePath: "/memory.md",
          content: "Shared memory",
        }),
      );
      await vi.waitFor(() =>
        expect(
          remote.query(catalog.queries.makeTaskQuery("main")),
        ).toBeDefined(),
      );
      await vi.waitFor(() =>
        expect(
          remote.query(catalog.queries.makeStoreFileQuery("/memory.md"))
            ?.content,
        ).toBe("Shared memory"),
      );
      expect(remote.query(taskQuery)).toBeUndefined();
      expect(remote.query(messagesQuery)).toEqual([]);
      expect(pushed.map((event) => event.name)).toEqual([
        "v1.TaskInited",
        "v1.WriteStoreFile",
      ]);
    },
  );
});
