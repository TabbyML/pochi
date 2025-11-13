import type React from "react";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAutoApproveGuard } from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import type { Task } from "@getpochi/livekit";
import { useTranslation } from "react-i18next";
import { useSendTaskNotification } from "../../chat/lib/use-send-task-notification";
import type { PendingRetryApproval } from "../hooks/use-pending-retry-approval";

interface RetryApprovalButtonProps {
  pendingApproval: PendingRetryApproval;
  retry: (error: Error) => void;
  task: Task | undefined;
  isSubTask: boolean;
}

export const RetryApprovalButton: React.FC<RetryApprovalButtonProps> = ({
  pendingApproval,
  retry,
  task,
  isSubTask,
}) => {
  const { t } = useTranslation();

  const { sendNotification } = useSendTaskNotification();

  useEffect(() => {
    if (pendingApproval.countdown === 0) {
      doRetry();
    }
  }, [pendingApproval]);

  const doRetry = useCallback(() => {
    pendingApproval.stopCountdown();
    retry(pendingApproval.error);
  }, [retry, pendingApproval]);

  const autoApproveGuard = useAutoApproveGuard();
  const onAccept = useCallback(() => {
    autoApproveGuard.current = "auto";
    doRetry();
  }, [autoApproveGuard, doRetry]);

  const [showRetry, setShowRetry] = useDebounceState(false, 1_000);
  useEffect(() => {
    setShowRetry(true);
  }, [setShowRetry]);

  useEffect(() => {
    const uid = isSubTask ? task?.parentId : task?.id;
    if (
      showRetry &&
      uid &&
      task?.status === "failed" &&
      (pendingApproval.attempts === undefined ||
        pendingApproval.countdown === undefined)
    ) {
      sendNotification("failed", {
        cwd: task.cwd,
        uid,
      });
    }
  }, [
    showRetry,
    sendNotification,
    pendingApproval,
    isSubTask,
    task?.parentId,
    task?.id,
    task?.cwd,
    task?.status,
  ]);

  if (!showRetry) return null;

  return (
    <>
      <Button onClick={onAccept}>
        {pendingApproval.attempts !== undefined &&
        pendingApproval.countdown !== undefined
          ? t("toolInvocation.continueInSeconds", {
              seconds: pendingApproval.countdown,
            })
          : t("toolInvocation.continue")}
      </Button>
      {pendingApproval.countdown !== undefined && (
        <Button onClick={pendingApproval.stopCountdown} variant="secondary">
          {t("toolInvocation.cancel")}
        </Button>
      )}
    </>
  );
};
