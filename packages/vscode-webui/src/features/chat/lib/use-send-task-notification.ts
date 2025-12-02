import { vscodeHost } from "@/lib/vscode";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import { getTaskDisplayTitle } from "@getpochi/common/task-utils";
import type { TaskPanelParams } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useRef } from "react";

export function useSendTaskNotification() {
  const timer = useRef<number | undefined>(undefined);

  const sendNotification = useCallback(
    async (
      kind: "failed" | "completed" | "pending-tool" | "pending-input",
      openTaskParams: TaskPanelParams & { isSubTask?: boolean },
    ) => {
      clearTimeout(timer.current);

      timer.current = window.setTimeout(async () => {
        if (await vscodeHost.isTaskPanelVisible(openTaskParams)) {
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
            renderMessage = openTaskParams.isSubTask
              ? "Pochi has completed the sub task."
              : "Pochi has completed the task.";
            break;
          case "failed":
            renderMessage = "Pochi is running into error, please take a look.";
            break;
          default:
            break;
        }
        const { cwd, displayId, uid } = openTaskParams;
        const taskTitle = getTaskDisplayTitle({
          worktreeName: getWorktreeNameFromWorktreePath(cwd) ?? "main",
          displayId,
          uid,
        });
        const buttonText = "View Details";
        const result = await vscodeHost.showInformationMessage(
          `[${taskTitle}] ${renderMessage}`,
          {
            modal: false,
          },
          buttonText,
        );
        if (result === buttonText) {
          vscodeHost.openTaskInPanel(openTaskParams);
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
