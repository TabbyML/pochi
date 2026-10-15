import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import type { Message } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { browserSessionManager } from "./browser-session-manager";
import { useBrowserAgentSettings } from "./hooks/use-browser-agent-settings";

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
  const { browserSettings } = useBrowserAgentSettings();
  useEffect(() => {
    if (!browserSettings) return;
    const { taskId: parentId } = decodeStoreId(store.storeId);

    // Completion and the next assistant message can arrive in the same render.
    // Inspect the whole trajectory so a finished browser call is still flushed.
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type !== "tool-newTask" ||
          part.input?.agentType !== "browser"
        ) {
          continue;
        }
        const taskId = part.input._meta?.uid;
        if (!taskId) continue;

        if (part.state === "input-available") {
          void browserSessionManager.registerSession(taskId, parentId, {
            viewport:
              browserSettings.runtime.mode === "managed"
                ? browserSettings.managedBrowser.viewport
                : undefined,
          });
        } else if (
          part.state === "output-available" ||
          part.state === "output-error"
        ) {
          void browserSessionManager.unregisterSession(
            taskId,
            part.toolCallId,
            store,
          );
        }
      }
    }
  }, [browserSettings, messages, store]);
};
