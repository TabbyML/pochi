import { vscodeHost } from "@/lib/vscode";
import type { Message, Task } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useLatest } from "./hooks/use-latest";

/** @useSignals */
export const useBrowserSession = (taskId: string) => {
  const { data } = useQuery({
    queryKey: ["browserSession", taskId],
    queryFn: async () => {
      return threadSignal(await vscodeHost.readBrowserSession(taskId));
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data?.value;
};

export const useManageBrowserSession = ({
  uid,
  task,
  isSubTask,
}: { uid: string; task: Task | undefined; isSubTask: boolean }) => {
  const onStreamStart = useLatest(
    (
      data: Pick<Task, "id" | "cwd"> & {
        messages: Message[];
      },
    ) => {
      const topTaskUid = isSubTask ? task?.parentId : uid;
      const cwd = data.cwd;
      if (!topTaskUid || !cwd) return;

      manageBrowserSession({
        taskId: topTaskUid,
        messages: data.messages,
      });
    },
  );

  const onStreamFinish = useLatest(
    (
      data: Pick<Task, "id" | "cwd" | "status"> & {
        messages: Message[];
        error?: Error;
      },
    ) => {
      const topTaskUid = isSubTask ? task?.parentId : uid;
      const cwd = data.cwd;
      if (!topTaskUid || !cwd) return;

      manageBrowserSession({
        taskId: topTaskUid,
        messages: data.messages,
      });
    },
  );

  return { onStreamStart, onStreamFinish };
};

export const manageBrowserSession = ({
  taskId,
  messages,
}: { taskId: string; messages: Message[] }) => {
  const lastToolPart = messages.at(-1)?.parts.at(-1);

  if (
    lastToolPart?.type !== "tool-newTask" ||
    lastToolPart?.input?.agentType !== "browser"
  ) {
    return;
  }

  if (lastToolPart?.state === "input-available") {
    vscodeHost.registerBrowserSession(taskId);
  }

  if (
    lastToolPart?.state === "output-available" ||
    lastToolPart?.state === "output-error"
  ) {
    vscodeHost.unregisterBrowserSession(taskId);
  }
};
