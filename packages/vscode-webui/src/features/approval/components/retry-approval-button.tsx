import type React from "react";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAutoApproveGuard, useHandleChatEvents } from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useReviews } from "@/lib/hooks/use-reviews";
import { useTranslation } from "react-i18next";
import type { PendingRetryApproval } from "../hooks/use-pending-retry-approval";

interface RetryApprovalButtonProps {
  pendingApproval: PendingRetryApproval;
  retry: (error: Error) => void;
}

export const RetryApprovalButton: React.FC<RetryApprovalButtonProps> = ({
  pendingApproval,
  retry,
}) => {
  const { t } = useTranslation();
  const reviews = useReviews();

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

  useHandleChatEvents({
    sendRetry: onAccept,
  });

  const [showRetry, setShowRetry] = useDebounceState(false, 1_000);
  useEffect(() => {
    setShowRetry(true);
  }, [setShowRetry]);

  const isCountingDown = isRetryApprovalCountingDown(pendingApproval);
  const isReviewEmpty = reviews.length === 0;

  if (!showRetry) return null;

  // If reviews exist, hide the "Continue" button to allow the "Submit Review" button to be shown instead.
  if (!isCountingDown && !isReviewEmpty) return null;

  return (
    <>
      <Button onClick={onAccept}>
        {isCountingDown
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

export function isRetryApprovalCountingDown(
  pendingApproval: PendingRetryApproval,
) {
  return (
    pendingApproval.attempts !== undefined &&
    pendingApproval.countdown !== undefined
  );
}
