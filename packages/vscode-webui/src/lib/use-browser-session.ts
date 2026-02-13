import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { browserSessionManager } from "./browser-session-manager";

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
  messages,
}: { messages: Message[] }) => {
  const lastToolPart = messages.at(-1)?.parts.at(-1);
  const store = useDefaultStore();

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
        const taskId = lastToolPart.input?._meta?.uid || "";
        if (browserSessionManager.isRegistered(taskId)) {
          return;
        }
        await browserSessionManager.registerSession(taskId);
      }

      // Unregister browser related sessions
      if (
        lastToolPart.type === "tool-newTask" &&
        lastToolPart.input?.agentType === "browser" &&
        (lastToolPart.state === "output-available" ||
          lastToolPart.state === "output-error")
      ) {
        const taskId = lastToolPart.input?._meta?.uid || "";
        if (!browserSessionManager.isRegistered(taskId)) {
          return;
        }
        await browserSessionManager.unregisterSession(
          taskId,
          lastToolPart.toolCallId,
          store,
        );
      }
    };

    manageBrowserSession();
  }, [lastToolPart, store]);
};
