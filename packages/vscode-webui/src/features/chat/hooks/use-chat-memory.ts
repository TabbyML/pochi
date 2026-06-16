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
  LiveChatKitMemoryOptions,
} from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useMemo } from "react";

type BackgroundTaskStateStore = NonNullable<
  LiveChatKitBackgroundTaskOptions["stateStore"]
>;

function createVscodeBackgroundTaskStateStore(): BackgroundTaskStateStore {
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
  parentCwd,
}: {
  taskId: string;
  isSubTask: boolean;
  parentCwd?: string;
}) {
  const { taskMemoryState, setTaskMemoryState } = useTaskMemoryState(taskId);
  const taskMemoryStateRef = useLatest(taskMemoryState);
  const setTaskMemoryStateRef = useLatest(setTaskMemoryState);
  const taskMemoryStateStore = useMemo(
    () => ({
      get: () => taskMemoryStateRef.current,
      set: (state: TaskMemoryState) => setTaskMemoryStateRef.current?.(state),
    }),
    [setTaskMemoryStateRef, taskMemoryStateRef],
  );

  const { autoMemoryState, setAutoMemoryState } = useAutoMemoryState(taskId);
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
      isSubTask
        ? undefined
        : {
            adaptor: new VscodeRunningTaskAdaptor(),
            clearFileStateCache: (taskId) =>
              vscodeHost.clearFileStateCache(taskId),
            stateStore: createVscodeBackgroundTaskStateStore(),
          },
    [isSubTask, taskId],
  );

  const parentCwdRef = useLatest(parentCwd);
  const memory = useMemo<LiveChatKitMemoryOptions | undefined>(
    () =>
      isSubTask
        ? undefined
        : {
            parentCwd: () => parentCwdRef.current,
            taskMemoryStateStore,
            autoMemoryStateStore,
            autoMemoryBackend: {
              readContext: (cwd) => vscodeHost.readAutoMemory({ cwd }),
              writeTaskTranscript: (options) =>
                vscodeHost.writeTaskTranscript(options),
              beginDreamRun: ({ cwd }) =>
                vscodeHost.beginAutoMemoryDream({ cwd }),
              finishDreamRun: (options) =>
                vscodeHost.finishAutoMemoryDream(options),
            },
          },
    [autoMemoryStateStore, isSubTask, parentCwdRef, taskMemoryStateStore],
  );

  return {
    backgroundTask,
    memory,
  };
}
