import { getReadyForRetryError, isRetryableError } from "@/features/retry";
import {
  getPendingToolcallApproval,
  isToolAutoApproved,
  type useAutoApprove,
} from "@/features/settings";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import type { Message } from "@getpochi/livekit";
import { type useAutoApproveGuard, useRetryCount } from "../lib/chat-state";
import { useSendTaskNotification } from "../lib/use-send-task-notification";

interface UseChatNotificationsProps {
  uid: string;
  task: Task | undefined;
  isSubTask: boolean;
  autoApproveGuard: ReturnType<typeof useAutoApproveGuard>;
  autoApproveActive: boolean;
  autoApproveSettings: ReturnType<typeof useAutoApprove>["autoApproveSettings"];
}

export function useChatNotifications({
  uid,
  task,
  isSubTask,
  autoApproveGuard,
  autoApproveActive,
  autoApproveSettings,
}: UseChatNotificationsProps) {
  const { sendNotification, clearNotification } = useSendTaskNotification();

  const { toolset } = useMcp();
  const { retryCount } = useRetryCount();

  const onStreamStart = useLatest(
    (
      data: Pick<Task, "id" | "cwd"> & {
        messages: Message[];
      },
    ) => {
      const topTaskUid = isSubTask ? task?.parentId : uid;
      const cwd = data.cwd;
      if (!topTaskUid || !cwd) return;

      clearNotification();
      vscodeHost.onTaskRunning(topTaskUid);
    },
  );

  const onStreamFinish = useLatest(
    (
      data: Pick<Task, "id" | "cwd" | "status"> & {
        messages: Message[];
        error?: Error;
      },
    ) => {
      const topTaskUid = isSubTask ? task?.parentId : uid;
      const cwd = data.cwd;
      if (!topTaskUid || !cwd) return;

      if (data.status === "failed" && data.error) {
        let autoApprove = autoApproveGuard.current === "auto";
        if (data.error && !isRetryableError(data.error)) {
          autoApprove = false;
        }

        const retryLimit =
          autoApproveActive && autoApproveSettings.retry && autoApprove
            ? autoApproveSettings.maxRetryLimit
            : 0;

        if (
          retryLimit === 0 ||
          (retryCount?.count !== undefined && retryCount.count >= retryLimit)
        ) {
          sendNotification("failed", {
            uid: topTaskUid,
            isSubTask,
          });
        }
        return;
      }

      const lastMessage = data.messages.at(-1);
      if (!lastMessage) return;

      if (data.status === "pending-tool") {
        const pendingToolCallApproval = getPendingToolcallApproval(lastMessage);
        if (pendingToolCallApproval) {
          const autoApproved = isToolAutoApproved({
            autoApproveActive,
            autoApproveSettings,
            toolset,
            pendingApproval: pendingToolCallApproval,
          });

          if (!autoApproved) {
            sendNotification("pending-tool", {
              uid: topTaskUid,
              isSubTask,
            });
          }
        }
      }

      if (data.status === "pending-input") {
        const readyForRetryError = getReadyForRetryError(data.messages);
        if (!readyForRetryError) return;

        const retryLimit =
          autoApproveActive && autoApproveSettings.retry
            ? autoApproveSettings.maxRetryLimit
            : 0;

        if (
          retryLimit === 0 ||
          (retryCount?.count !== undefined && retryCount.count >= retryLimit)
        ) {
          sendNotification("pending-input", {
            uid: topTaskUid,
            isSubTask,
          });
        }
      }

      if (data.status === "completed") {
        sendNotification("completed", {
          uid: topTaskUid,
          isSubTask,
        });
      }
    },
  );

  return { onStreamStart, onStreamFinish };
}
