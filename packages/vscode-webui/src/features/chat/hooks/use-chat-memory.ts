import { useAutoMemoryState } from "@/lib/hooks/use-auto-memory-state";
import { useLatest } from "@/lib/hooks/use-latest";
import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { vscodeHost } from "@/lib/vscode";
import { VscodeRunningTaskAdaptor } from "@/lib/vscode-running-task-adaptor";
import type { AutoMemoryTaskState, TaskMemoryState } from "@getpochi/common";
import type {
  LiveChatKitBackgroundTaskOptions,
  LiveChatKitMemoryOptions,
} from "@getpochi/livekit";
import { useMemo } from "react";

const vscodeBackgroundTaskFileStateCache: NonNullable<
  LiveChatKitBackgroundTaskOptions["fileStateCache"]
> = {
  clear: (taskId) => vscodeHost.clearFileStateCache(taskId),
};

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
            fileStateCache: vscodeBackgroundTaskFileStateCache,
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
