import type React from "react";

import type { PendingApproval } from "@/features/approval";
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
  isSubTask,
  retry,
}) => {
  if (!allowAddToolResult || !pendingApproval) return null;

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
