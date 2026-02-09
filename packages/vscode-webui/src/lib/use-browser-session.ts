import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

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
  const registeredSessions = useRef<string[]>([]);

  useEffect(() => {
    if (
      lastToolPart?.type !== "tool-newTask" ||
      lastToolPart?.input?.agentType !== "browser"
    ) {
      return;
    }

    const uid = lastToolPart.input?._meta?.uid;
    if (!uid) {
      return;
    }

    if (lastToolPart?.state === "input-available") {
      if (!registeredSessions.current.includes(uid)) {
        vscodeHost.registerBrowserSession(uid);
        registeredSessions.current.push(uid);
      }
    }

    if (
      lastToolPart?.state === "output-available" ||
      lastToolPart?.state === "output-error"
    ) {
      if (registeredSessions.current.includes(uid)) {
        vscodeHost.unregisterBrowserSession(uid);
        registeredSessions.current.splice(
          registeredSessions.current.indexOf(uid),
          1,
        );
      }
    }
  }, [lastToolPart]);
};
