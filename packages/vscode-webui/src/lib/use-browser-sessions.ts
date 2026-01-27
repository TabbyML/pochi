import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

/** @useSignals */
export const useBrowserSessions = () => {
  const { data } = useQuery({
    queryKey: ["browserSessions"],
    queryFn: async () => {
      return threadSignal(await vscodeHost.readBrowserSessions());
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data?.value || {};
};

export const useManageBrowserSessions = () => {
  return useCallback(
    ({ taskId, messages }: { taskId: string; messages: Message[] }) => {
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

      if (lastToolPart?.state === "output-available") {
        vscodeHost.unregisterBrowserSession(taskId);
      }
    },
    [],
  );
};
