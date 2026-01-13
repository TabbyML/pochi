import { vscodeHost } from "@/lib/vscode";
import { useCallback, useEffect, useRef } from "react";

export function useSendTaskNotification() {
  const timer = useRef<number | undefined>(undefined);

  const sendNotification = useCallback(
    async (
      kind: "failed" | "completed" | "pending-tool" | "pending-input",
      openTaskParams: {
        uid: string;
        isSubTask?: boolean;
      },
    ) => {
      clearTimeout(timer.current);

      timer.current = window.setTimeout(async () => {
        vscodeHost.sendTaskNotification(kind, openTaskParams);
      }, 500);
    },
    [],
  );

  const clearNotification = useCallback(() => {
    clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  return {
    sendNotification,
    clearNotification,
  };
}
