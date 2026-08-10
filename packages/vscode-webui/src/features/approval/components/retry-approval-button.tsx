import type React from "react";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAutoApproveGuard, useHandleChatEvents } from "@/features/chat";
import { ReadyForRetryError } from "@/features/retry";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useReviews } from "@/lib/hooks/use-reviews";
import { useTranslation } from "react-i18next";
import type { PendingRetryApproval } from "../hooks/use-pending-retry-approval";

interface RetryApprovalButtonProps {
  pendingApproval: PendingRetryApproval;
  retry: (error: Error) => void;
  /**
   * Whether there is at least one message waiting in the queue. When true,
   * continuing should send the next queued message instead of retrying /
   * regenerating the last assistant message.
   */
  hasQueuedMessages?: boolean;
  /**
   * Dequeues and sends the first queued message. Required when
   * `hasQueuedMessages` is true.
   */
  onContinueWithQueuedMessage?: () => void;
}

export const RetryApprovalButton: React.FC<RetryApprovalButtonProps> = ({
  pendingApproval,
  retry,
  hasQueuedMessages = false,
  onContinueWithQueuedMessage,
}) => {
  const { t } = useTranslation();
  const reviews = useReviews();
  const isContentFilter =
    pendingApproval.error instanceof ReadyForRetryError &&
    pendingApproval.error.kind === "content-filter";

  const handleContinue = useCallback(() => {
    pendingApproval.stopCountdown();
    if (!isContentFilter && hasQueuedMessages && onContinueWithQueuedMessage) {
      // A message is already queued, so continue the chat by sending it
      // instead of retrying / regenerating the previous turn.
      onContinueWithQueuedMessage();
      return;
    }
    retry(pendingApproval.error);
  }, [
    retry,
    pendingApproval,
    isContentFilter,
    hasQueuedMessages,
    onContinueWithQueuedMessage,
  ]);

  useEffect(() => {
    if (pendingApproval.countdown === 0) {
      handleContinue();
    }
  }, [pendingApproval, handleContinue]);

  const autoApproveGuard = useAutoApproveGuard();
  const onAccept = useCallback(() => {
    autoApproveGuard.current = "auto";
    handleContinue();
  }, [autoApproveGuard, handleContinue]);

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
          : t(
              isContentFilter
                ? "toolInvocation.retry"
                : "toolInvocation.continue",
            )}
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
