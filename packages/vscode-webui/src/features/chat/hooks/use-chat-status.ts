import { useToolCallLifeCycle } from "../lib/chat-state";
import type { BlockingState } from "./use-blocking-operations";

interface UseChatStatusProps {
  isModelsLoading: boolean;
  isModelValid: boolean;
  isLoading: boolean;
  isInputEmpty: boolean;
  isFilesEmpty: boolean;
  isReviewsEmpty: boolean;
  isUploadingAttachments: boolean;
  blockingState: BlockingState;
}

export function useChatStatus({
  isModelsLoading,
  isModelValid,
  isLoading,
  isInputEmpty,
  isFilesEmpty,
  isReviewsEmpty,
  isUploadingAttachments,
  blockingState,
}: UseChatStatusProps) {
  const { isExecuting } = useToolCallLifeCycle();

  const isBusyCore = isModelsLoading || blockingState.isBusy;

  const showEditTodos = !isBusyCore;

  const isSubmitDisabled =
    isBusyCore ||
    !isModelValid ||
    isUploadingAttachments ||
    (!isLoading &&
      isInputEmpty &&
      isFilesEmpty &&
      isReviewsEmpty &&
      !isExecuting);

  const showStopButton = isExecuting || isLoading || isUploadingAttachments;

  return {
    isExecuting,
    isBusyCore,
    showEditTodos,
    isSubmitDisabled,
    showStopButton,
  };
}
