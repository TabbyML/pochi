import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useTaskArchived = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["tasksArchived"],
    queryFn: () => fetchTaskArchived(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const tasksArchived = data?.tasksArchived.value;
  const isTaskArchived = useCallback(
    (taskId: string) => {
      return (
        tasksArchived &&
        taskId in tasksArchived &&
        tasksArchived[taskId] === true
      );
    },
    [tasksArchived],
  );

  return {
    tasksArchived: data?.tasksArchived.value,
    setTaskArchived: data?.setTaskArchived,
    isLoading: isLoading,
    isTaskArchived,
  };
};

async function fetchTaskArchived() {
  const result = await vscodeHost.readTaskArchived();
  return {
    tasksArchived: threadSignal(result.value),
    setTaskArchived: result.setTaskArchived,
  };
}
