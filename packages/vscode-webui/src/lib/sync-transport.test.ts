// @vitest-environment node
import {
  InvalidPushError,
  ServerAheadError,
  SyncBackend,
  UnknownError,
} from "@livestore/common";
import { EventSequenceNumber } from "@livestore/livestore";
import { makeWsSync } from "@livestore/sync-cf/client";
import {
  MAX_WS_MESSAGE_BYTES,
  splitChunkBySize,
} from "@livestore/sync-cf/common";
import {
  FetchHttpClient,
  Effect,
  Chunk,
  Exit,
  Fiber,
  KeyValueStore,
  Layer,
  Option,
  Rpc,
  Schedule,
  Schema,
  Stream,
  SubscriptionRef,
} from "@livestore/utils/effect";
import * as TestClock from "effect/TestClock";
import * as TestContext from "effect/TestContext";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withSyncPushTimeout } from "./sync";

// Mirror the SDK's Push RPC shape so we can encode its exit without reaching
// into @livestore/sync-cf internals (which the package does not export).
const PushRpc = Rpc.make("SyncWsRpc.Push", {
  success: Schema.Struct({}),
  error: InvalidPushError,
});
const encodePushExit = Schema.encodeSync(Rpc.exitSchema(PushRpc));

afterEach(() => vi.unstubAllGlobals());

describe("sync upload recovery", () => {
  it.each([false, true])(
    "retries a missing ACK without duplicate appends (already committed: %s)",
    async (committedBeforeTimeout) => {
      let pushCalls = 0;
      let appends = 0;
      let remoteHead = 0;
      let pongs = 0;
      class FakeWebSocket extends EventTarget {
        readyState = 1;
        send(bytes: string) {
          const message = JSON.parse(bytes);
          const respond = (data: unknown) =>
            queueMicrotask(() =>
              this.dispatchEvent(
                new MessageEvent("message", { data: JSON.stringify(data) }),
              ),
            );
          if (message._tag === "Ping") {
            pongs++;
            respond({ _tag: "Pong" });
            return;
          }
          if (message._tag !== "Request" || message.tag !== "SyncWsRpc.Push")
            return;
          pushCalls++;
          const first = message.payload.batch[0];
          const last = message.payload.batch.at(-1);
          if (pushCalls === 1) {
            if (committedBeforeTimeout) {
              remoteHead = last.seqNum;
              appends++;
            }
            return;
          }
          const result =
            first.parentSeqNum !== remoteHead
              ? Exit.fail(
                  new InvalidPushError({
                    cause: new ServerAheadError({
                      minimumExpectedNum:
                        EventSequenceNumber.Global.make(remoteHead),
                      providedNum: EventSequenceNumber.Global.make(
                        first.parentSeqNum,
                      ),
                    }),
                  }),
                )
              : Exit.succeed({});
          if (result._tag === "Success") {
            remoteHead = last.seqNum;
            appends++;
          }
          respond({
            _tag: "Exit",
            requestId: message.id,
            exit: encodePushExit(result),
          });
        }
        close() {
          this.readyState = 3;
        }
      }
      vi.stubGlobal("WebSocket", FakeWebSocket);
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const backend = yield* withSyncPushTimeout(
              makeWsSync({
                url: "ws://synthetic.invalid",
              }),
            )({ storeId: "test", clientId: "a", payload: { jwt: "test" } });
            const failures: unknown[] = [];
            const fiber = yield* backend
              .push([
                {
                  name: "synthetic",
                  args: {},
                  seqNum: EventSequenceNumber.Global.make(1),
                  parentSeqNum: EventSequenceNumber.Global.make(0),
                  clientId: "a",
                  sessionId: "b",
                },
              ])
              .pipe(
                Effect.tapError((error) =>
                  Effect.sync(() => failures.push(error)),
                ),
                Effect.retry(
                  Schedule.spaced(1000).pipe(
                    Schedule.intersect(Schedule.recurs(1)),
                  ),
                ),
                Effect.either,
                Effect.forkScoped,
              );
            yield* TestClock.adjust(29999);
            expect(pushCalls).toBe(1);
            expect(Option.isNone(yield* Fiber.poll(fiber))).toBe(true);
            expect(pongs).toBeGreaterThan(0);
            yield* TestClock.adjust(1);
            expect(failures).toEqual([
              expect.objectContaining({
                _tag: "InvalidPushError",
                cause: expect.objectContaining({
                  _tag: "LiveStore.UnknownError",
                  cause: expect.objectContaining({ _tag: "TimeoutException" }),
                }),
              }),
            ]);
            yield* TestClock.adjust(1000);
            const result = yield* Fiber.join(fiber);
            expect(pushCalls).toBe(2);
            expect(appends).toBe(1);
            expect(remoteHead).toBe(1);
            expect(result._tag).toBe(committedBeforeTimeout ? "Left" : "Right");
            if (result._tag === "Left")
              expect(result.left).toMatchObject({
                cause: { _tag: "ServerAheadError" },
              });
          }),
        ).pipe(
          Effect.provide(
            Layer.mergeAll(
              TestContext.TestContext,
              KeyValueStore.layerMemory,
              FetchHttpClient.layer,
            ),
          ),
        ),
      );
    },
  );
});

it("allows a healthy split batch to take more than 30 seconds", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const completed: number[] = [];
        const push = vi.fn(
          (batch: Parameters<SyncBackend.SyncBackend["push"]>[0]) =>
            Effect.sleep("20 seconds").pipe(
              Effect.tap(() =>
                Effect.sync(() =>
                  completed.push(...batch.map((event) => event.seqNum)),
                ),
              ),
            ),
        );
        const backend = yield* withSyncPushTimeout(() =>
          Effect.gen(function* () {
            return SyncBackend.of({
              isConnected: yield* SubscriptionRef.make(true),
              connect: Effect.void,
              ping: Effect.void,
              pull: () => Stream.empty,
              push,
              supports: { pullPageInfoKnown: false, pullLive: false },
              metadata: { name: "slow", description: "slow" },
            });
          }),
        )({ storeId: "test", clientId: "a", payload: { jwt: "test" } });
        const batch = [1, 2].map((seq) => ({
          name: "synthetic",
          args: { text: "x".repeat(500000) },
          seqNum: EventSequenceNumber.Global.make(seq),
          parentSeqNum: EventSequenceNumber.Global.make(seq - 1),
          clientId: "a",
          sessionId: "b",
        }));
        const fiber = yield* backend.push(batch).pipe(Effect.forkScoped);
        yield* TestClock.adjust(20000);
        expect(completed).toEqual([1]);
        expect(push.mock.calls.map(([batch]) => batch.length)).toEqual([1, 1]);
        yield* TestClock.adjust(20000);
        yield* Fiber.join(fiber);
        expect(completed).toEqual([1, 2]);
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestContext.TestContext,
          KeyValueStore.layerMemory,
          FetchHttpClient.layer,
        ),
      ),
    ),
  );
});

it("preserves the SDK size limit with large credentials and rejects oversize before sending", async () => {
  const counts: number[] = [];
  class AckWebSocket extends EventTarget {
    readyState = 1;
    send(bytes: string) {
      const message = JSON.parse(bytes);
      const respond = (data: unknown) =>
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent("message", { data: JSON.stringify(data) }),
          ),
        );
      if (message._tag === "Ping") respond({ _tag: "Pong" });
      if (message._tag === "Request" && message.tag === "SyncWsRpc.Push") {
        counts.push(message.payload.batch.length);
        respond({
          _tag: "Exit",
          requestId: message.id,
          exit: encodePushExit(Exit.succeed({})),
        });
      }
    }
    close() {
      this.readyState = 3;
    }
  }
  vi.stubGlobal("WebSocket", AckWebSocket);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore;
        const backendId = "b".repeat(36);
        yield* kv.set("backendId", backendId);
        const args = {
          storeId: "boundary",
          clientId: "a",
          payload: { jwt: "x".repeat(20000) },
        };
        const backend = yield* withSyncPushTimeout(
          makeWsSync({ url: "ws://synthetic.invalid" }),
        )(args);
        const event = {
          name: "synthetic",
          args: { text: "" },
          seqNum: EventSequenceNumber.Global.make(1),
          parentSeqNum: EventSequenceNumber.Global.make(0),
          clientId: "a",
          sessionId: "b",
        };
        const overhead = new TextEncoder().encode(
          JSON.stringify({
            storeId: args.storeId,
            payload: args.payload,
            batch: [event],
            backendId: Option.some(backendId),
          }),
        ).byteLength;
        event.args.text = "x".repeat(MAX_WS_MESSAGE_BYTES - overhead);
        const small = {
          ...event,
          args: { text: "small" },
          seqNum: EventSequenceNumber.Global.make(2),
          parentSeqNum: event.seqNum,
        };
        yield* backend.push([event, small]);
        expect(counts).toEqual([1, 1]);
        const result = yield* backend
          .push([small, { ...event, args: { text: event.args.text + "x" } }])
          .pipe(Effect.either);
        expect(result).toMatchObject({
          _tag: "Left",
          left: { cause: { cause: { _tag: "OversizeChunkItemError" } } },
        });
        expect(counts).toEqual([1, 1]);
      }),
    ).pipe(
      Effect.provide(
        Layer.merge(KeyValueStore.layerMemory, FetchHttpClient.layer),
      ),
    ),
  );
});

it("refreshes near-limit chunk boundaries when the backend ID becomes known", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const args = {
          storeId: "id-change",
          clientId: "a",
          payload: { jwt: "test" },
        };
        const sizes: number[] = [];
        const completed: number[] = [];
        const backend = yield* withSyncPushTimeout(() =>
          Effect.gen(function* () {
            const id = yield* SyncBackend.makeBackendIdHelper;
            return SyncBackend.of({
              isConnected: yield* SubscriptionRef.make(true),
              connect: Effect.void,
              ping: Effect.void,
              pull: () => Stream.empty,
              supports: { pullPageInfoKnown: false, pullLive: false },
              metadata: { name: "id-change", description: "id-change" },
              push: (batch) =>
                Effect.gen(function* () {
                  sizes.push(batch.length);
                  const chunks = yield* Chunk.fromIterable(batch).pipe(
                    splitChunkBySize({
                      maxItems: 100,
                      maxBytes: MAX_WS_MESSAGE_BYTES,
                      encode: (batch) => ({
                        storeId: args.storeId,
                        payload: args.payload,
                        batch,
                        backendId: id.get(),
                      }),
                    }),
                  );
                  for (const chunk of chunks) {
                    yield* Effect.sleep("20 seconds");
                    completed.push(
                      ...Array.from(chunk, (event) => event.seqNum),
                    );
                    yield* id.lazySet("b".repeat(36));
                  }
                }).pipe(
                  Effect.mapError(
                    (cause) =>
                      new InvalidPushError({
                        cause: new UnknownError({ cause }),
                      }),
                  ),
                ),
            });
          }),
        )(args);
        const event = (seq: number, text: string) => ({
          name: "synthetic",
          args: { text },
          seqNum: EventSequenceNumber.Global.make(seq),
          parentSeqNum: EventSequenceNumber.Global.make(seq - 1),
          clientId: "a",
          sessionId: "b",
        });
        const remaining = [event(2, "x".repeat(400000)), event(3, "")];
        const size = new TextEncoder().encode(
          JSON.stringify({
            storeId: args.storeId,
            payload: args.payload,
            batch: remaining,
            backendId: Option.none(),
          }),
        ).byteLength;
        remaining[1].args.text = "x".repeat(MAX_WS_MESSAGE_BYTES - size);
        const fiber = yield* backend
          .push([event(1, "x".repeat(600000)), ...remaining])
          .pipe(Effect.forkScoped);
        yield* TestClock.adjust(60000);
        yield* Fiber.join(fiber);
        expect(sizes).toEqual([1, 1, 1]);
        expect(completed).toEqual([1, 2, 3]);
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestContext.TestContext,
          KeyValueStore.layerMemory,
          FetchHttpClient.layer,
        ),
      ),
    ),
  );
});
