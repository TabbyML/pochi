import { vscodeHost } from "@/lib/vscode";
import type { TaskPanelParams } from "@getpochi/common/vscode-webui-bridge";
import { useCallback } from "react";

export function useSendTaskNotification() {
  const sendNotification = useCallback(
    async (
      kind: "failed" | "completed" | "pending-tool",
      openTaskParams: { uid: string; cwd: string | null },
    ) => {
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
    },
    [],
  );

  return {
    sendNotification,
  };
}
