import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useTaskPinned = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["tasksPinned"],
    queryFn: () => fetchTaskPinned(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const tasksPinned = data?.tasksPinned.value;
  const isTaskPinned = useCallback(
    (taskId: string) => {
      return (
        tasksPinned && taskId in tasksPinned && tasksPinned[taskId] === true
      );
    },
    [tasksPinned],
  );

  return {
    tasksPinned: data?.tasksPinned.value,
    setTaskPinned: data?.setTaskPinned,
    isLoading,
    isTaskPinned,
  };
};

async function fetchTaskPinned() {
  const result = await vscodeHost.readTaskPinned();
  return {
    tasksPinned: threadSignal(result.value),
    setTaskPinned: result.setTaskPinned,
  };
}
