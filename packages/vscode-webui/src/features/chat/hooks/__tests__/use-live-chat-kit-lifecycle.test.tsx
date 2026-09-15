import {
  type BackgroundJobNotification,
  createBackgroundJobNotification,
} from "@getpochi/common";
import {
  BackgroundJobManager,
  type RunningTaskAdaptor,
} from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { StrictMode, Suspense } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { makeJobStore } from "../../../../../../livekit/src/background-job/__tests__/test-store";

afterEach(cleanup);

async function setup() {
  const { store } = makeJobStore();
  const notifications = new Map<
    string,
    (notices: readonly BackgroundJobNotification[]) => void
  >();
  const dispose = vi.fn();
  const disconnect = vi.fn();
  const adaptor = {
    dispose,
    getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
    executeToolCall: vi.fn(),
    commandSource: {
      kill: vi.fn(async () => {}),
      observeCommands: vi.fn(async (update) => {
        update({});
        return { dispose: disconnect };
      }),
      observeNotifications: vi.fn(async (taskId, update) => {
        notifications.set(taskId, update);
        update([]);
        return { dispose: disconnect, acknowledge: vi.fn(async () => {}) };
      }),
    },
  } satisfies RunningTaskAdaptor & { dispose(): void };
  const manager = BackgroundJobManager.forStore(store);
  manager.initialize({ blobStore: {} as never, adaptor });
  await manager.watchTask("parent");
  const options: Parameters<typeof useLiveChatKit>[0] = {
    taskId: "parent",
    store,
    blobStore: {} as never,
    getters: { getLLM: () => ({ id: "test" }) as never },
    backgroundJobManager: manager,
  };
  return { options, manager, adaptor, dispose, disconnect, notifications };
}

it("does not reconnect the panel's jobs from a suspended or replayed chat render", async () => {
  const { options, manager, adaptor, dispose } = await setup();
  let resume!: () => void;
  let ready = false;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  function Chat() {
    useLiveChatKit(options);
    if (!ready) throw pending;
    return <div>Task ready</div>;
  }
  const { unmount } = render(
    <StrictMode>
      <Suspense fallback={<div>Loading task</div>}>
        <Chat />
      </Suspense>
    </StrictMode>,
  );
  await act(async () => {
    ready = true;
    resume();
  });
  expect(await screen.findByText("Task ready")).toBeTruthy();
  expect(adaptor.commandSource.observeCommands).toHaveBeenCalledOnce();
  expect(adaptor.commandSource.observeNotifications).toHaveBeenCalledOnce();
  unmount();
  expect(dispose).not.toHaveBeenCalled();
  await manager.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

it("keeps the same executor and command connection when the chat is replaced", async () => {
  const { options, manager, adaptor, dispose, disconnect } = await setup();
  const { result, rerender, unmount } = renderHook(
    (props) => useLiveChatKit(props),
    { initialProps: options },
  );
  const first = result.current;
  rerender({ ...options, enableAutoCompact: true });
  expect(result.current).not.toBe(first);
  expect(result.current.backgroundJobManager).toBe(manager);
  expect(adaptor.commandSource.observeCommands).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();
  expect(disconnect).not.toHaveBeenCalled();
  unmount();
  expect(dispose).not.toHaveBeenCalled();
  await manager.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it("collects a command result on return without delivering it through the unmounted parent", async () => {
  const { options, manager, notifications } = await setup();
  const oldPendingChange = vi.fn();
  const first = renderHook(() =>
    useLiveChatKit({
      ...options,
      backgroundJobNotifications: { onPendingChange: oldPendingChange },
    }),
  );
  await act(async () => {});
  first.unmount();
  oldPendingChange.mockClear();
  const notice = createBackgroundJobNotification({
    taskId: "parent",
    backgroundJobId: "bgjob-cmd-one",
    command: "test",
    outputFile: "/tmp/output",
    status: "completed",
    finishedAt: 1,
  });
  await act(async () => {
    notifications.get("parent")?.([notice]);
  });
  expect(oldPendingChange).not.toHaveBeenCalled();
  expect(manager.getPendingNotifications("parent")).toEqual([notice]);
  const reopened = renderHook(() => useLiveChatKit(options));
  await act(async () => {});
  expect(
    reopened.result.current.pendingBackgroundJobNotifications,
  ).toHaveLength(1);
  reopened.unmount();
  await manager.dispose();
});
