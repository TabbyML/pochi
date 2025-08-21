import type { PendingApproval } from "@/features/approval";
import type { useImageUpload } from "@/lib/hooks/use-image-upload";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import type React from "react";
import { useCallback } from "react";
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
}: UseChatSubmitProps) {
  const autoApproveGuard = useAutoApproveGuard();
  const { executingToolCalls } = useToolCallLifeCycle();
  const isExecuting = executingToolCalls.length > 0;
  const abortToolCalls = useCallback(() => {
    for (const toolCall of executingToolCalls) {
      toolCall.abort();
    }
  }, [executingToolCalls]);

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

    if (isExecuting) {
      abortToolCalls();
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
    isUploading,
    isLoading,
    pendingApproval,
    abortToolCalls,
    cancelUpload,
    stopChat,
  ]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      // Compacting is not allowed to be stopped.
      if (newCompactTaskPending) return;

      const content = input.trim();
      if (isSubmitDisabled) {
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
            text: content.length === 0 ? " " : content,
            files: uploadedImages,
          });

          setInput("");
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (content.length > 0) {
        autoApproveGuard.current = true;
        clearUploadImageError();
        sendMessage({
          text: content,
        });
        setInput("");
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
    ],
  );

  return { handleSubmit, handleStop };
}
