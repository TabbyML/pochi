import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
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
  const store = useDefaultStore();
  const lastMessage = messages.at(-1);

  useEffect(() => {
    const manageBrowserSession = async () => {
      if (!lastMessage) {
        return;
      }

      for (const part of lastMessage.parts) {
        if (part.type !== "tool-newTask") {
          continue;
        }
        if (part.input?.agentType !== "browser") {
          continue;
        }

        // Register browser related sessions
        if (part.state === "input-available") {
          const taskId = part.input?._meta?.uid || "";
          const { taskId: parentId } = decodeStoreId(store.storeId);
          if (!browserSessionManager.isRegistered(taskId)) {
            await browserSessionManager.registerSession(taskId, parentId);
          }
        }

        // Unregister browser related sessions
        if (
          part.state === "output-available" ||
          part.state === "output-error"
        ) {
          const taskId = part.input?._meta?.uid || "";
          if (browserSessionManager.isRegistered(taskId)) {
            await browserSessionManager.unregisterSession(
              taskId,
              part.toolCallId,
              store,
            );
          }
        }
      }
    };

    manageBrowserSession();
  }, [lastMessage, store]);
};
