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
  const { isExecuting, isPreviewing } = useToolCallLifeCycle();

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
      !isExecuting &&
      !isPreviewing);

  const showStopButton =
    isPreviewing || isExecuting || isLoading || isUploadingAttachments;

  const showPreview = !isBusyCore;

  return {
    isExecuting,
    isBusyCore,
    showEditTodos,
    isSubmitDisabled,
    showStopButton,
    showPreview,
  };
}
