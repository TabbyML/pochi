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
  isPastedTextsEmpty: boolean;
  isUploadingAttachments: boolean;
  blockingState: BlockingState;
  taskStatus: Task["status"] | undefined;
}

export function useChatStatus({
  isModelValid,
  isLoading,
  isInputEmpty,
  isFilesEmpty,
  isReviewsEmpty,
  isTerminalContextEmpty,
  isPastedTextsEmpty,
  isUploadingAttachments,
  blockingState,
  taskStatus,
}: UseChatStatusProps) {
  const { isExecuting, completeToolCalls } = useToolCallLifeCycle();
  const autoApproveGuard = useAutoApproveGuard();
  const isAboutToExecuteWithAutoApprove =
    !isLoading &&
    !isExecuting &&
    taskStatus === "pending-tool" &&
    autoApproveGuard.current === "auto" &&
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
      !isTerminalContextEmpty ||
      !isPastedTextsEmpty);

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
