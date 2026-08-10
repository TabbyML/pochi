import type React from "react";

import type { PendingApproval } from "@/features/approval";
import type { SubtaskInfo } from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import type { Task } from "@getpochi/livekit";
import { useEffect } from "react";
import { RetryApprovalButton } from "./retry-approval-button";
import { ToolCallApprovalButton } from "./tool-call-approval-button";

interface ApprovalButtonProps {
  pendingApproval?: PendingApproval;
  retry: (error: Error) => void;
  allowAddToolResult: boolean;
  isSubTask: boolean;
  task?: Task;
  subtask?: SubtaskInfo;
  onToolCallApprovalVisible?: () => void;
  onToolsExecutionStarted?: () => void;
  onToolsExecutionEnded?: () => void;
  /**
   * Whether there is at least one message waiting in the queue. When true,
   * the "Continue" button (shown after e.g. a manual stop) sends the next
   * queued message instead of retrying / regenerating the previous turn.
   */
  hasQueuedMessages?: boolean;
  /** Dequeues and sends the first queued message. */
  onContinueWithQueuedMessage?: () => void;
}

export const ApprovalButton: React.FC<ApprovalButtonProps> = ({
  task,
  allowAddToolResult,
  pendingApproval,
  retry,
  isSubTask,
  subtask,
  onToolCallApprovalVisible,
  onToolsExecutionStarted,
  onToolsExecutionEnded,
  hasQueuedMessages,
  onContinueWithQueuedMessage,
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
        <RetryApprovalButton
          pendingApproval={pendingApproval}
          retry={retry}
          hasQueuedMessages={hasQueuedMessages}
          onContinueWithQueuedMessage={onContinueWithQueuedMessage}
        />
      ) : (
        <ToolCallApprovalButton
          taskId={task?.id}
          pendingApproval={pendingApproval}
          isSubTask={isSubTask}
          parentUid={task?.parentId ?? undefined}
          subtask={subtask}
          onVisible={onToolCallApprovalVisible}
          onToolsExecutionStarted={onToolsExecutionStarted}
          onToolsExecutionEnded={onToolsExecutionEnded}
        />
      )}
    </div>
  );
};
