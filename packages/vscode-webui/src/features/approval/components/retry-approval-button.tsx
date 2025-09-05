import type React from "react";
import { useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useAutoApproveGuard } from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import type { PendingRetryApproval } from "../hooks/use-pending-retry-approval";

interface RetryApprovalButtonProps {
  pendingApproval: PendingRetryApproval;
  retry: (error: Error) => void;
}

export const RetryApprovalButton: React.FC<RetryApprovalButtonProps> = ({
  pendingApproval,
  retry,
}) => {
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
    autoApproveGuard.current = true;
    doRetry();
  }, [autoApproveGuard, doRetry]);

  const [showRetry, setShowRetry] = useDebounceState(false, 1_000);
  useEffect(() => {
    setShowRetry(true);
  }, [setShowRetry]);

  if (!showRetry) return null;

  return (
    <>
      <Button onClick={onAccept}>
        {pendingApproval.attempts !== undefined &&
        pendingApproval.countdown !== undefined
          ? `Continue in ${pendingApproval.countdown}s`
          : "Continue"}
      </Button>
      {pendingApproval.countdown !== undefined && (
        <Button onClick={pendingApproval.stopCountdown} variant="secondary">
          {"Cancel"}
        </Button>
      )}
    </>
  );
};
