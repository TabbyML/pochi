// @vitest-environment jsdom
import { type LiveKitStore } from "@getpochi/livekit";
import {
  InvalidPushError,
  IsOfflineError,
  SyncBackend,
  UnknownError,
} from "@livestore/common";
import { StoreInternalsSymbol } from "@livestore/livestore";
import {
  Deferred,
  Effect,
  RpcClientError,
  Socket,
  Stream,
  Subscribable,
  SubscriptionRef,
} from "@livestore/utils/effect";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeSyncBackend, syncChannelName } from "../sync";
import { useSyncStatus } from "./use-sync-status";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function makeFakeStore() {
  const head = { global: 1, client: 0, rebaseGeneration: 0 };
  const network = Effect.runSync(SubscriptionRef.make({ isConnected: true }));
  const leader = Effect.runSync(
    SubscriptionRef.make({ pending: [] as unknown[], localHead: head }),
  );
  const session = Effect.runSync(
    SubscriptionRef.make({ pending: [] as unknown[], localHead: head }),
  );
  const getLeader = vi.fn(() => Effect.runSync(leader));
  const leaderThread = {
    networkStatus: Subscribable.fromSubscriptionRef(
      network,
    ) as Subscribable.Subscribable<{ isConnected: boolean }, Error>,
    syncState: Subscribable.make({
      get: Effect.sync(getLeader),
      changes: Stream.die("Must not subscribe to all pending event bodies"),
    }),
  };
  const commit = vi.fn();
  const store = {
    storeId: crypto.randomUUID(),
    commit,
    query: () => [
      { id: "m1", taskId: "task", data: { id: "m1", role: "user", parts: [] } },
    ],
    [StoreInternalsSymbol]: {
      clientSession: { leaderThread },
      syncProcessor: { syncState: Subscribable.fromSubscriptionRef(session) },
    },
  } as unknown as LiveKitStore;
  return {
    store,
    leaderThread,
    commit,
    getLeader,
    setConnected: (isConnected: boolean) =>
      Effect.runPromise(SubscriptionRef.set(network, { isConnected })),
    setLeader: (pending: number, global = 1, name = "v1.MessageUpserted") =>
      Effect.runPromise(
        SubscriptionRef.set(leader, {
          pending: new Array(pending).fill({ name }),
          localHead: { ...head, global },
        }),
      ),
    setSession: (pending: number, global = 1, name = "v1.MessageUpserted") =>
      Effect.runPromise(
        SubscriptionRef.set(session, {
          pending: new Array(pending).fill({ name }),
          localHead: { ...head, global },
        }),
      ),
  };
}

describe("useSyncStatus", () => {
  it("keeps the initial query loading until a status snapshot is available", async () => {
    const fake = makeFakeStore();
    const initial = Effect.runSync(
      Deferred.make<ReturnType<typeof fake.getLeader>>(),
    );
    fake.leaderThread.syncState = Subscribable.make({
      get: initial,
      changes: Stream.never,
    });
    const { result } = renderHook(() => useSyncStatus(fake.store));
    expect(result.current.isLoading).toBe(true);
    await act(() =>
      Effect.runPromise(Deferred.succeed(initial, fake.getLeader())),
    );
    expect(result.current).toMatchObject({
      isLoading: false,
      state: "synced",
    });
  });

  it("keeps the initial disconnected snapshot loading until the connection attempt ends", async () => {
    const fake = makeFakeStore();
    await fake.setConnected(false);
    const { result } = renderHook(() => useSyncStatus(fake.store));
    await waitFor(() => expect(fake.getLeader).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);
    const channel = new BroadcastChannel(syncChannelName(fake.store.storeId));
    try {
      channel.postMessage({
        type: "sync-status",
        error: null,
        isConnecting: false,
      });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.state).toBe("offline");
    } finally {
      channel.close();
    }
  });

  it("shows the status after connecting and reports later disconnects without a placeholder", async () => {
    const fake = makeFakeStore();
    await fake.setConnected(false);
    const { result } = renderHook(() => useSyncStatus(fake.store));
    await waitFor(() => expect(fake.getLeader).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(true);
    await act(() => fake.setConnected(true));
    expect(result.current).toMatchObject({ isLoading: false, state: "synced" });
    await act(() => fake.setConnected(false));
    expect(result.current).toMatchObject({ isLoading: false, state: "offline" });
  });

  it("excludes local fork events from both page and leader pending", async () => {
    const fake = makeFakeStore();
    await fake.setLeader(4, 1, "v1.ForkAgentLocalEvent");
    await fake.setSession(2, 1, "v1.ForkAgentLocalEvent");
    const { result } = renderHook(() => useSyncStatus(fake.store));
    await waitFor(() => expect(result.current).toMatchObject({ state: "synced", pending: 0 }));
  });
  it("does not read full leader pending while the menu is closed", async () => {
    const fake = makeFakeStore();
    const { result } = renderHook(() =>
      useSyncStatus(fake.store, { enabled: false }),
    );
    await act(() => fake.setConnected(false));
    await waitFor(() => expect(result.current.state).toBe("offline"));
    expect(fake.getLeader).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("reports synced, syncing and offline using on-demand reads", async () => {
    const fake = makeFakeStore();
    const { result, rerender } = renderHook(
      ({ enabled }) => useSyncStatus(fake.store, { enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.state).toBe("synced"));
    await act(() => fake.setLeader(3));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() =>
      expect(result.current).toMatchObject({ state: "syncing", pending: 3 }),
    );
    await act(() => fake.setConnected(false));
    expect(result.current.state).toBe("offline");
  });

  it("includes page events not yet received by the leader", async () => {
    const fake = makeFakeStore();
    await fake.setSession(1, 2);
    const { result } = renderHook(() => useSyncStatus(fake.store));
    await waitFor(() => expect(fake.getLeader).toHaveBeenCalled());
    await waitFor(() => expect(result.current.pending).toBe(1));
    expect(result.current.state).toBe("syncing");
  });

  it("does not retain synced when a status subscription fails", async () => {
    const fake = makeFakeStore();
    fake.leaderThread.networkStatus = {
      ...fake.leaderThread.networkStatus,
      changes: Stream.concat(
        fake.leaderThread.networkStatus.changes.pipe(Stream.take(1)),
        Stream.fail(new Error("Worker unavailable")),
      ),
    };
    const { result } = renderHook(() => useSyncStatus(fake.store));
    await waitFor(() =>
      expect(result.current.error).toContain("Worker unavailable"),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.state).not.toBe("synced");
  });

  it("does not reuse another store's synced result", async () => {
    const a = makeFakeStore();
    const b = makeFakeStore();
    b.leaderThread.syncState = Subscribable.make({
      get: Effect.never,
      changes: Stream.never,
    });
    const { result, rerender } = renderHook(
      ({ store }) => useSyncStatus(store),
      { initialProps: { store: a.store } },
    );
    await waitFor(() => expect(result.current.state).toBe("synced"));
    await act(async () => rerender({ store: b.store }));
    expect(result.current.state).not.toBe("synced");
    expect(result.current.isLoading).toBe(true);
  });

  it("re-sends a snapshot even when the task was already synced", async () => {
    const fake = makeFakeStore();
    const { result } = renderHook(() =>
      useSyncStatus(fake.store, { taskId: "task" }),
    );
    await waitFor(() => expect(result.current.state).toBe("synced"));
    await act(() => result.current.sync());
    expect(fake.commit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "v1.MessageUpserted" }),
    );
    expect(result.current.isRequesting).toBe(false);
  });

  it.each(["leader", "page", "offline"] as const)(
    "waits for existing %s pending without appending a snapshot",
    async (source) => {
      const fake = makeFakeStore();
      const { result, rerender } = renderHook(
        ({ enabled }) => useSyncStatus(fake.store, { taskId: "task", enabled }),
        { initialProps: { enabled: true } },
      );
      await waitFor(() => expect(result.current.state).toBe("synced"));
      // The click must read current pending, not the menu's cached summary.
      await act(async () => {
        if (source === "page") await fake.setSession(1, 2);
        else await fake.setLeader(2);
        if (source === "offline") await fake.setConnected(false);
      });
      vi.useFakeTimers();
      let operation: Promise<void>;
      let finished = false;
      let failure: unknown;
      await act(async () => {
        operation = result.current.sync().then(
          () => {
            finished = true;
          },
          (error) => {
            failure = error;
          },
        );
      });
      expect(fake.commit).not.toHaveBeenCalled();
      expect(result.current.isRequesting).toBe(true);
      rerender({ enabled: false });
      rerender({ enabled: true });
      await act(() => result.current.sync());
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(finished).toBe(false);
      expect(fake.commit).not.toHaveBeenCalled();
      await act(async () => {
        await fake.setLeader(0, 2);
        await fake.setSession(0, 2);
        await fake.setConnected(true);
        await vi.advanceTimersByTimeAsync(5000);
        await operation;
      });
      expect(failure).toBeUndefined();
      expect(result.current).toMatchObject({
        state: "synced",
        isRequesting: false,
      });
      // Draining pending completes this request; it must not then resend everything.
      expect(fake.commit).not.toHaveBeenCalled();
    },
  );

  it("keeps waiting beyond 30 seconds and finishes after remote confirmation", async () => {
    const fake = makeFakeStore();
    const { result } = renderHook(() =>
      useSyncStatus(fake.store, { taskId: "task" }),
    );
    await waitFor(() => expect(result.current.state).toBe("synced"));
    vi.useFakeTimers();
    fake.commit.mockImplementation(() => {
      fake.getLeader.mockReturnValue({
        pending: [{}],
        localHead: { global: 2, client: 0, rebaseGeneration: 0 },
      });
    });
    let finished = false;
    let failure: unknown;
    let operation: Promise<void>;
    await act(async () => {
      operation = result.current.sync().then(
        () => {
          finished = true;
        },
        (error) => {
          failure = error;
        },
      );
    });
    await act(() => vi.advanceTimersByTimeAsync(35000));
    expect(failure).toBeUndefined();
    expect(finished).toBe(false);
    expect(result.current).toMatchObject({
      state: "syncing",
      error: null,
      isRequesting: true,
    });
    expect(fake.commit).toHaveBeenCalledTimes(1);
    fake.getLeader.mockReturnValue({ pending: [], localHead: { global: 2, client: 0, rebaseGeneration: 0 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await operation;
    });
    expect(finished).toBe(true);
    expect(result.current).toMatchObject({
      state: "synced",
      error: null,
      isRequesting: false,
    });
  });

  it.each(["existing", "new"] as const)(
    "ends manual waiting for %s upload errors without changing the queue",
    async (failureTiming) => {
      const fake = makeFakeStore();
      const { result, unmount } = renderHook(() =>
        useSyncStatus(fake.store, { taskId: "task", enabled: false }),
      );
      await act(() => fake.setLeader(2));
      const channel = new BroadcastChannel(syncChannelName(fake.store.storeId));
      const reportFailure = () =>
        channel.postMessage({
          type: "sync-status",
          error: "OversizeChunkItemError",
        });
      let operation: Promise<void> | undefined;
      try {
        if (failureTiming === "existing") {
          reportFailure();
          await waitFor(() =>
            expect(result.current.error).toBe("OversizeChunkItemError"),
          );
        }
        await act(async () => {
          operation = result.current.sync().catch(() => {});
        });
        if (failureTiming === "new") {
          expect(result.current.isRequesting).toBe(true);
          reportFailure();
        }
        await waitFor(
          () =>
            expect(result.current).toMatchObject({
              isRequesting: false,
              error: "OversizeChunkItemError",
            }),
          { timeout: 6000 },
        );
        expect(fake.commit).not.toHaveBeenCalled();
        // A later confirmed queue can be checked and resent, even if the UI's
        // previous error has not yet been cleared by a worker notification.
        await act(() => fake.setLeader(0));
        await act(() => result.current.sync());
        expect(fake.commit).toHaveBeenCalledOnce();
        expect(result.current).toMatchObject({ error: null, isRequesting: false });
      } finally {
        unmount();
        channel.close();
        await operation;
      }
    },
    10000,
  );

  it("checks the fresh queue before acting on a cached error arriving during the read", async () => {
    const fake = makeFakeStore();
    const initial = Effect.runSync(Deferred.make<void>());
    fake.leaderThread.syncState = Subscribable.make({
      get: Effect.zipRight(initial, Effect.sync(fake.getLeader)),
      changes: Stream.never,
    });
    const { result, unmount } = renderHook(() =>
      useSyncStatus(fake.store, { taskId: "task", enabled: false }),
    );
    const channel = new BroadcastChannel(syncChannelName(fake.store.storeId));
    let operation: Promise<void> | undefined;
    try {
      await act(async () => {
        operation = result.current.sync().catch(() => {});
      });
      channel.postMessage({ type: "sync-status", error: "Previous upload failed" });
      await waitFor(() => expect(result.current.error).not.toBeNull());
      await act(async () => {
        await Effect.runPromise(Deferred.succeed(initial, undefined));
        await operation;
      });
      expect(fake.commit).toHaveBeenCalledOnce();
      expect(result.current).toMatchObject({ error: null, isRequesting: false });
    } finally {
      unmount();
      channel.close();
      await operation;
    }
  });

  it("cancels the confirmation wait when unmounted", async () => {
    const fake = makeFakeStore();
    const { result, unmount } = renderHook(() =>
      useSyncStatus(fake.store, { taskId: "task" }),
    );
    await waitFor(() => expect(result.current.state).toBe("synced"));
    vi.useFakeTimers();
    fake.commit.mockImplementation(() => {
      fake.getLeader.mockReturnValue({
        pending: [{}],
        localHead: { global: 2, client: 0, rebaseGeneration: 0 },
      });
    });
    let stopped = false;
    await act(async () => {
      void result.current.sync().catch(() => {
        stopped = true;
      });
    });
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(stopped).toBe(true);
    const reads = fake.getLeader.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(60000));
    expect(fake.getLeader).toHaveBeenCalledTimes(reads);
  });

  it("reads leader pending only every five seconds while the menu is open", async () => {
    vi.useFakeTimers();
    const fake = makeFakeStore();
    renderHook(() => useSyncStatus(fake.store));
    await act(() => vi.advanceTimersByTimeAsync(0));
    const reads = fake.getLeader.mock.calls.length;
    expect(reads).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(fake.getLeader).toHaveBeenCalledTimes(reads);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fake.getLeader).toHaveBeenCalledTimes(reads + 1);
  });

  it("does not report a slow status read as an upload failure", async () => {
    vi.useFakeTimers();
    const fake = makeFakeStore();
    fake.leaderThread.syncState = Subscribable.make({
      get: Effect.never,
      changes: Stream.never,
    });
    const { result } = renderHook(() => useSyncStatus(fake.store));
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(result.current).toMatchObject({ state: "syncing", error: null });
  });

  it("classifies backend disconnects, reports real failures, and clears them on recovery", async () => {
    const fake = makeFakeStore();
    const { result, rerender } = renderHook(
      ({ enabled }) => useSyncStatus(fake.store, { enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.state).toBe("synced"));
    rerender({ enabled: false });
    const channel = new BroadcastChannel(syncChannelName(fake.store.storeId));
    const notifications: (string | null)[] = [];
    channel.onmessage = (event) => notifications.push(event.data.error);
    let failure: IsOfflineError | InvalidPushError | undefined;
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
                metadata: {
                  name: "test",
                  description: "Backend to hook integration",
                },
                push: () =>
                  Effect.suspend(() => {
                    attempts++;
                    return failure ? Effect.fail(failure) : Effect.void;
                  }),
              }),
              fake.store.storeId,
            );
            for (const offline of [
              new IsOfflineError({ cause: "Disconnected" }),
              new InvalidPushError({
                cause: new UnknownError({
                  cause: new RpcClientError.RpcClientError({
                    reason: "Protocol",
                    message: "Error in socket",
                    cause: new Socket.SocketCloseError({
                      reason: "Close",
                      code: 1006,
                    }),
                  }),
                }),
              }),
            ]) {
              failure = offline;
              yield* Effect.promise(() => act(() => fake.setConnected(false)));
              yield* backend.push([]).pipe(Effect.either);
              failure = undefined;
              const previous = notifications.length;
              yield* backend.push([]);
              yield* Effect.promise(() =>
                waitFor(() => {
                  expect(notifications.length).toBeGreaterThan(previous);
                  expect(notifications.at(-1)).toBeNull();
                }),
              );
              expect(notifications.every((error) => error === null)).toBe(true);
              expect(result.current).toMatchObject({
                state: "offline",
                error: null,
              });
              yield* Effect.promise(() => act(() => fake.setConnected(true)));
            }
            for (const cause of [
              "OversizeChunkItemError",
              new RpcClientError.RpcClientError({
                reason: "Protocol",
                message: "Invalid server response",
                cause: new SyntaxError("Invalid JSON"),
              }),
            ]) {
              failure = new InvalidPushError({
                cause: new UnknownError({ cause }),
              });
              yield* backend.push([]).pipe(Effect.either);
              yield* Effect.promise(() =>
                waitFor(() => expect(result.current.error).not.toBeNull()),
              );
              expect(result.current.state).not.toBe("synced");
              failure = undefined;
              yield* backend.push([]);
              yield* Effect.promise(() =>
                waitFor(() =>
                  expect(result.current).toMatchObject({
                    state: "synced",
                    error: null,
                  }),
                ),
              );
            }
            expect(attempts).toBe(8);
          }),
        ),
      );
    } finally {
      channel.close();
    }
  });

  it("receives actual upload failures while the menu is closed", async () => {
    const fake = makeFakeStore();
    const { result } = renderHook(() =>
      useSyncStatus(fake.store, { enabled: false }),
    );
    const channel = new BroadcastChannel(syncChannelName(fake.store.storeId));
    try {
      channel.postMessage({
        type: "sync-status",
        error: "OversizeChunkItemError",
      });
      await waitFor(() =>
        expect(result.current.error).toBe("OversizeChunkItemError"),
      );
      expect(result.current.state).toBe("offline");
      channel.postMessage({ type: "sync-status", error: null });
      await waitFor(() => expect(result.current.error).toBeNull());
    } finally {
      channel.close();
    }
  });
});
