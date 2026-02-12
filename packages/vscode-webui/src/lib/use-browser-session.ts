import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import type { Message, Task } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import * as runExclusive from "run-exclusive";
import { browserRecordingManager } from "./browser-recording-manager";

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
  isSubTask,
  task,
  messages,
}: { isSubTask: boolean; task?: Task; messages: Message[] }) => {
  const parentTaskId = isSubTask ? task?.parentId || "" : task?.id;
  const lastToolPart = messages.at(-1)?.parts.at(-1);
  const store = useDefaultStore();

  const runSerialized = useMemo(
    () =>
      runExclusive.build(async (callback: () => Promise<void>) => {
        await callback();
      }),
    [],
  );

  useEffect(() => {
    const manageBrowserSession = async () => {
      if (!lastToolPart) {
        return;
      }

      // Register browser related sessions
      if (
        lastToolPart.type === "tool-newTask" &&
        lastToolPart.input?.agentType === "browser" &&
        lastToolPart.state === "input-available"
      ) {
        const toolCallId = lastToolPart.toolCallId;
        const taskId = lastToolPart.input?._meta?.uid || "";
        if (browserRecordingManager.isRegistered(toolCallId)) {
          return;
        }
        browserRecordingManager.registerBrowserRecordingSession(toolCallId);
        const browserSession = await vscodeHost.registerBrowserSession(
          taskId,
          parentTaskId,
        );
        if (browserSession?.streamUrl) {
          browserRecordingManager.startRecording(
            toolCallId,
            browserSession.streamUrl,
          );
        }
      }

      // Unregister browser related sessions
      if (
        lastToolPart.type === "tool-newTask" &&
        lastToolPart.input?.agentType === "browser" &&
        (lastToolPart.state === "output-available" ||
          lastToolPart.state === "output-error")
      ) {
        const toolCallId = lastToolPart.toolCallId;
        const taskId = lastToolPart.input?._meta?.uid || "";
        if (!browserRecordingManager.isRegistered(toolCallId)) {
          return;
        }
        await vscodeHost.unregisterBrowserSession(taskId);
        await browserRecordingManager.stopRecording(
          toolCallId,
          parentTaskId || "",
          store,
        );
        browserRecordingManager.unregisterBrowserRecordingSession(toolCallId);
      }
    };

    runSerialized(manageBrowserSession);
  }, [parentTaskId, lastToolPart, store, runSerialized]);
};
