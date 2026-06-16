import { useAutoMemoryState } from "@/lib/hooks/use-auto-memory-state";
import { useLatest } from "@/lib/hooks/use-latest";
import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { vscodeHost } from "@/lib/vscode";
import { VscodeRunningTaskAdaptor } from "@/lib/vscode-running-task-adaptor";
import type {
  AutoMemoryTaskState,
  BackgroundTaskState,
  TaskMemoryState,
} from "@getpochi/common";
import type {
  LiveChatKitBackgroundTaskOptions,
  LiveChatKitProjectMemoryOptions,
  LiveChatKitTaskMemoryOptions,
} from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useMemo } from "react";

function createVscodeBackgroundTaskStateStore(): NonNullable<
  LiveChatKitBackgroundTaskOptions["stateStore"]
> {
  const entries = new Map<
    string,
    Promise<{
      value: { value: BackgroundTaskState | undefined };
      setBackgroundTaskState: (state: BackgroundTaskState) => Promise<void>;
    }>
  >();

  const getEntry = (taskId: string) => {
    let entry = entries.get(taskId);
    if (!entry) {
      entry = vscodeHost.readBackgroundTaskState(taskId).then((result) => ({
        value: threadSignal(result.value),
        setBackgroundTaskState: result.setBackgroundTaskState,
      }));
      entries.set(taskId, entry);
    }
    return entry;
  };

  return {
    read: async (taskId) => (await getEntry(taskId)).value.value,
    set: async (taskId, state) => {
      await (await getEntry(taskId)).setBackgroundTaskState(state);
    },
  };
}

export function useChatMemory({
  taskId,
  isSubTask,
}: {
  taskId: string;
  isSubTask: boolean;
}) {
  const isRootTask = !isSubTask;
  const { taskMemoryState, setTaskMemoryState } = useTaskMemoryState(taskId, {
    enabled: isRootTask,
  });
  const taskMemoryStateRef = useLatest(taskMemoryState);
  const setTaskMemoryStateRef = useLatest(setTaskMemoryState);
  const taskMemoryStateStore = useMemo(
    () => ({
      get: () => taskMemoryStateRef.current,
      set: (state: TaskMemoryState) => setTaskMemoryStateRef.current?.(state),
    }),
    [setTaskMemoryStateRef, taskMemoryStateRef],
  );

  const { autoMemoryState, setAutoMemoryState } = useAutoMemoryState(taskId, {
    enabled: isRootTask,
  });
  const autoMemoryStateRef = useLatest(autoMemoryState);
  const setAutoMemoryStateRef = useLatest(setAutoMemoryState);
  const autoMemoryStateStore = useMemo(
    () => ({
      get: () => autoMemoryStateRef.current,
      set: (state: AutoMemoryTaskState) =>
        setAutoMemoryStateRef.current?.(state),
    }),
    [autoMemoryStateRef, setAutoMemoryStateRef],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: adaptor lifetime is tied to the task id.
  const backgroundTask = useMemo<LiveChatKitBackgroundTaskOptions | undefined>(
    () =>
      isRootTask
        ? {
            adaptor: new VscodeRunningTaskAdaptor(),
            clearFileStateCache: (taskId) =>
              vscodeHost.clearFileStateCache(taskId),
            stateStore: createVscodeBackgroundTaskStateStore(),
          }
        : undefined,
    [isRootTask, taskId],
  );

  const taskMemory = useMemo<LiveChatKitTaskMemoryOptions | undefined>(
    () =>
      isRootTask
        ? {
            stateStore: taskMemoryStateStore,
          }
        : undefined,
    [isRootTask, taskMemoryStateStore],
  );
  const projectMemory = useMemo<LiveChatKitProjectMemoryOptions | undefined>(
    () =>
      isRootTask
        ? {
            stateStore: autoMemoryStateStore,
            backend: {
              readContext: (cwd) => vscodeHost.readAutoMemory({ cwd }),
              writeTaskTranscript: (options) =>
                vscodeHost.writeTaskTranscript(options),
              beginDreamRun: ({ cwd }) =>
                vscodeHost.beginAutoMemoryDream({ cwd }),
              finishDreamRun: (options) =>
                vscodeHost.finishAutoMemoryDream(options),
            },
          }
        : undefined,
    [autoMemoryStateStore, isRootTask],
  );

  return {
    backgroundTask,
    taskMemory,
    projectMemory,
  };
}
