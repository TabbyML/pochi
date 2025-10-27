import { useToolCallLifeCycle } from "../lib/chat-state";

interface UseChatStatusProps {
  isModelsLoading: boolean;
  isModelValid: boolean;
  isLoading: boolean;
  isInputEmpty: boolean;
  isFilesEmpty: boolean;
  isUploadingAttachments: boolean;
  newCompactTaskPending: boolean;
}

export function useChatStatus({
  isModelsLoading,
  isModelValid,
  isLoading,
  isInputEmpty,
  isFilesEmpty,
  isUploadingAttachments,
  newCompactTaskPending,
}: UseChatStatusProps) {
  const { isExecuting, isPreviewing } = useToolCallLifeCycle();

  const isBusyCore = isModelsLoading || newCompactTaskPending;

  const showEditTodos = !isBusyCore;

  const isSubmitDisabled =
    isBusyCore ||
    !isModelValid ||
    isUploadingAttachments ||
    (!isLoading &&
      isInputEmpty &&
      isFilesEmpty &&
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
