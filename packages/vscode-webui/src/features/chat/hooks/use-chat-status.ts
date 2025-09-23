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
  const { executingToolCalls } = useToolCallLifeCycle();
  const isExecuting = executingToolCalls.length > 0;

  const isBusyCore = isModelsLoading || newCompactTaskPending;

  const showEditTodos = !isBusyCore;

  const isSubmitDisabled =
    isBusyCore ||
    !isModelValid ||
    (!isLoading && isInputEmpty && isFilesEmpty && !isExecuting);

  const showStopButton = isExecuting || isLoading || isUploadingAttachments;

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
