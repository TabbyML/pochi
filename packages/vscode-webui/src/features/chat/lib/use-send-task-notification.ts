import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useChatState } from "./chat-state";

export function useSendTaskNotification() {
  const { t } = useTranslation();
  const { sendTaskNotificationGuard } = useChatState();

  const sendNotification = useCallback(
    async (task: Task | undefined) => {
      if (!task) return;
      if (!sendTaskNotificationGuard.current) return;

      let renderMessage = "";
      switch (task.status) {
        case "pending-tool":
          renderMessage = t("notification.task.status.pendingTool");
          break;
        case "completed":
          renderMessage = t("notification.task.status.completed");
          break;
        case "failed":
          renderMessage = t("notification.task.status.failed");
          break;
        default:
          break;
      }

      const result = await vscodeHost.showInformationMessage(
        renderMessage,
        {
          modal: false,
        },
        t("notification.task.action.viewDetail"),
      );
      if (result === t("notification.task.action.viewDetail") && task.cwd) {
        // do navigation
        vscodeHost.openTaskInPanel({
          cwd: task.cwd,
          uid: task.id,
        });
      }
    },
    [sendTaskNotificationGuard, t],
  );

  return {
    sendTaskNotificationGuard,
    sendNotification,
  };
}
