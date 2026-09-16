import { useAutoMemoryState } from "@/lib/hooks/use-auto-memory-state";
import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { vscodeAutoMemoryManager } from "@/lib/vscode";
import { useMemo } from "react";

export function useChatMemory({
  taskId,
  isSubTask,
}: { taskId: string; isSubTask: boolean }) {
  const { stateStore: taskStateStore, error: taskError } = useTaskMemoryState(
    taskId,
    {
      enabled: !isSubTask,
    },
  );
  const { stateStore: autoStateStore, error: autoError } = useAutoMemoryState(
    taskId,
    {
      enabled: !isSubTask,
    },
  );
  const taskMemory = useMemo(
    () =>
      !isSubTask && taskStateStore ? { stateStore: taskStateStore } : undefined,
    [isSubTask, taskStateStore],
  );
  const projectMemory = useMemo(
    () =>
      !isSubTask && autoStateStore
        ? { stateStore: autoStateStore, manager: vscodeAutoMemoryManager }
        : undefined,
    [isSubTask, autoStateStore],
  );
  return {
    taskMemory,
    projectMemory,
    isReady: isSubTask || !!(taskMemory && projectMemory),
    error: taskError ?? autoError,
  };
}
