import type { PendingApproval } from "@/features/approval";
import type { useImageUpload } from "@/lib/hooks/use-image-upload";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import type React from "react";
import { useCallback, useRef } from "react";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";

type UseChatReturn = Pick<UseChatHelpers<Message>, "sendMessage" | "stop">;

type UseImageUploadReturn = ReturnType<typeof useImageUpload>;

interface UseChatSubmitProps {
  chat: UseChatReturn;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  imageUpload: UseImageUploadReturn;
  isSubmitDisabled: boolean;
  isLoading: boolean;
  newCompactTaskPending: boolean;
  pendingApproval: PendingApproval | undefined;
  queuedMessages: string[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useChatSubmit({
  chat,
  input,
  setInput,
  imageUpload,
  isSubmitDisabled,
  isLoading,
  newCompactTaskPending,
  pendingApproval,
  queuedMessages,
  setQueuedMessages,
}: UseChatSubmitProps) {
  const autoApproveGuard = useAutoApproveGuard();
  const { executingToolCalls, previewingToolCalls } = useToolCallLifeCycle();
  const isExecuting = executingToolCalls.length > 0;
  const isPreviewing = (previewingToolCalls?.length ?? 0) > 0;
  const isSubmittingRef = useRef(false);

  const abortExecutingToolCalls = useCallback(() => {
    for (const toolCall of executingToolCalls) {
      toolCall.abort();
    }
  }, [executingToolCalls]);

  const abortPreviewingToolCalls = useCallback(() => {
    for (const toolCall of previewingToolCalls || []) {
      toolCall.abort();
    }
  }, [previewingToolCalls]);

  const { sendMessage, stop: stopChat } = chat;
  const {
    files,
    isUploading,
    upload,
    cancelUpload,
    clearError: clearUploadImageError,
  } = imageUpload;

  const handleStop = useCallback(() => {
    // Compacting is not allowed to be stopped.
    if (newCompactTaskPending) return;

    if (isPreviewing) {
      abortPreviewingToolCalls();
    }

    if (isExecuting) {
      abortExecutingToolCalls();
    } else if (isUploading) {
      cancelUpload();
    } else if (isLoading) {
      stopChat();
      return true;
    } else if (pendingApproval?.name === "retry") {
      pendingApproval.stopCountdown();
    }
  }, [
    newCompactTaskPending,
    isExecuting,
    isPreviewing,
    isUploading,
    isLoading,
    pendingApproval,
    abortExecutingToolCalls,
    abortPreviewingToolCalls,
    cancelUpload,
    stopChat,
  ]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();
      if (isSubmittingRef.current) return;

      isSubmittingRef.current = true;

      try {
        // Compacting is not allowed to be stopped.
        if (newCompactTaskPending) return;

        const currentInput = input.trim();
        const allMessages = [...queuedMessages];
        if (currentInput) {
          allMessages.push(currentInput);
        }

        if (isSubmitDisabled && allMessages.length === 0) {
          return;
        }

        if (handleStop()) {
          // break isLoading, we need to wait for some time to avoid racing between stop and submit.
          await new Promise((resolve) => setTimeout(resolve, 25));
        }

        autoApproveGuard.current = false;
        if (files.length > 0) {
          try {
            const uploadedImages = await upload();

            sendMessage({
              text: allMessages.join("\n") || " ",
              files: uploadedImages,
            });

            setInput("");
            setQueuedMessages([]);
          } catch (error) {
            // Error is already handled by the hook
            return;
          }
        } else if (allMessages.length > 0) {
          autoApproveGuard.current = true;
          clearUploadImageError();
          sendMessage({
            text: allMessages.join("\n"),
          });
          setInput("");
          setQueuedMessages([]);
        }
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      isSubmitDisabled,
      handleStop,
      files.length,
      input,
      autoApproveGuard,
      upload,
      sendMessage,
      setInput,
      clearUploadImageError,
      newCompactTaskPending,
      queuedMessages,
      setQueuedMessages,
    ],
  );

  return { handleSubmit, handleStop };
}
