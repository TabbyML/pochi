import { vscodeHost } from "@/lib/vscode";
import type { TaskPanelParams } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useRef } from "react";

export function useSendTaskNotification() {
  const timer = useRef<number | undefined>(undefined);

  const sendNotification = useCallback(
    async (
      kind: "failed" | "completed" | "pending-tool" | "pending-input",
      openTaskParams: { uid: string; cwd: string | null | undefined },
    ) => {
      clearTimeout(timer.current);

      timer.current = window.setTimeout(async () => {
        if (!openTaskParams.cwd) return;

        if (
          await vscodeHost.isTaskPanelVisible(openTaskParams as TaskPanelParams)
        ) {
          return;
        }

        let renderMessage = "";
        switch (kind) {
          case "pending-tool":
            renderMessage =
              "Pochi is trying to make a tool call that requires your approval.";
            break;
          case "pending-input":
            renderMessage = "Pochi is waiting for your input to continue.";
            break;
          case "completed":
            renderMessage = "Pochi has completed the task.";
            break;
          case "failed":
            renderMessage = "Pochi is running into error, please take a look.";
            break;
          default:
            break;
        }
        const result = await vscodeHost.showInformationMessage(
          renderMessage,
          {
            modal: false,
          },
          "View Details",
        );
        if (result === "View Details") {
          vscodeHost.openTaskInPanel(openTaskParams as TaskPanelParams);
        }
      }, 500);
    },
    [],
  );

  const clearNotification = useCallback(() => {
    clearTimeout(timer.current);
  }, []);

  return {
    sendNotification,
    clearNotification,
  };
}
