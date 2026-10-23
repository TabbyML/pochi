import type { PendingApproval } from "@/features/approval";
import { useToolAutoApproval } from "@/features/settings";
import { getLogger } from "@getpochi/common";
import type { Task } from "@getpochi/livekit";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";
import type { BlockingState } from "./use-blocking-operations";

const logger = getLogger("useChatStatus");

interface UseChatStatusProps {
  isModelValid: boolean;
  isLoading: boolean;
  isInputEmpty: boolean;
  isFilesEmpty: boolean;
  isReviewsEmpty: boolean;
  isTerminalContextEmpty: boolean;
  isUploadingAttachments: boolean;
  blockingState: BlockingState;
  taskStatus: Task["status"] | undefined;
  pendingApproval: PendingApproval | undefined;
  isSubTask: boolean;
}

export function useChatStatus({
  isModelValid,
  isLoading,
  isInputEmpty,
  isFilesEmpty,
  isReviewsEmpty,
  isTerminalContextEmpty,
  isUploadingAttachments,
  blockingState,
  taskStatus,
  pendingApproval,
  isSubTask,
}: UseChatStatusProps) {
  const { isExecuting, completeToolCalls } = useToolCallLifeCycle();
  const autoApproveGuard = useAutoApproveGuard();
  const isAutoApproved = useToolAutoApproval(
    pendingApproval?.name === "retry" ? undefined : pendingApproval,
    autoApproveGuard.current === "auto",
    isSubTask,
  );
  const isAboutToExecuteWithAutoApprove =
    !isLoading &&
    !isExecuting &&
    taskStatus === "pending-tool" &&
    autoApproveGuard.current === "auto" &&
    // A pending tool only blocks sending if the approval button will run it.
    // Sending while waiting for manual approval cancels the pending calls.
    (!pendingApproval || isAutoApproved) &&
    completeToolCalls.length === 0;

  const isRunning =
    blockingState.isBusy ||
    isLoading ||
    isAboutToExecuteWithAutoApprove ||
    isExecuting;

  // `submit`: send or queue message
  const isSubmitEnabled =
    !isUploadingAttachments &&
    (!isInputEmpty ||
      !isFilesEmpty ||
      !isReviewsEmpty ||
      !isTerminalContextEmpty);

  // `stop`: stop chat streaming or tool execution
  const isStopEnabled =
    !blockingState.isBusy &&
    (isLoading || isAboutToExecuteWithAutoApprove || isExecuting);

  // `sendMessage`: start chat streaming
  const allowSendMessage =
    !blockingState.isBusy &&
    isModelValid &&
    !isLoading &&
    !isAboutToExecuteWithAutoApprove &&
    !isExecuting;

  // `steer`: (if running, stop), then send a new message
  const allowSteer = !blockingState.isBusy && isModelValid;

  const allStatus = {
    isAboutToExecuteWithAutoApprove,
    isRunning,
    isSubmitEnabled,
    isStopEnabled,
    allowSendMessage,
    allowSteer,
  };

  logger.trace("allStatus", allStatus);

  return allStatus;
}
