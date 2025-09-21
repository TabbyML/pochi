import type React from "react";

import type { PendingApproval } from "@/features/approval";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useEffect } from "react";
import { RetryApprovalButton } from "./retry-approval-button";
import { ToolCallApprovalButton } from "./tool-call-approval-button";

interface ApprovalButtonProps {
  pendingApproval?: PendingApproval;
  retry: (error: Error) => void;
  allowAddToolResult: boolean;
  isSubTask: boolean;
}

export const ApprovalButton: React.FC<ApprovalButtonProps> = ({
  allowAddToolResult,
  pendingApproval,
  retry,
  isSubTask,
}) => {
  const shouldShowApprovalButton = pendingApproval && allowAddToolResult;

  const [showApprovalButton, setShowApprovalButton] = useDebounceState(
    false,
    550,
  );

  useEffect(() => {
    setShowApprovalButton(!!shouldShowApprovalButton);
  }, [setShowApprovalButton, shouldShowApprovalButton]);

  if (!showApprovalButton || !shouldShowApprovalButton) {
    return null;
  }

  return (
    <div className="flex select-none gap-3 [&>button]:flex-1 [&>button]:rounded-sm">
      {pendingApproval.name === "retry" ? (
        <RetryApprovalButton pendingApproval={pendingApproval} retry={retry} />
      ) : (
        <ToolCallApprovalButton
          pendingApproval={pendingApproval}
          isSubTask={isSubTask}
        />
      )}
    </div>
  );
};
