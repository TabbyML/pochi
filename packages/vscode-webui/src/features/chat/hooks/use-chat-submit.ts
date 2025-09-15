import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import type React from "react";
import { useCallback } from "react";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";

type UseChatReturn = Pick<UseChatHelpers<Message>, "sendMessage" | "stop">;

type UseAttachmentUploadReturn = ReturnType<typeof useAttachmentUpload>;

interface UseChatSubmitProps {
  chat: UseChatReturn;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  attachmentUpload: UseAttachmentUploadReturn;
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
  attachmentUpload,
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
    clearError: clearUploadError,
  } = attachmentUpload;

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

  /**
   * Handles form submission, sending both the current input and any queued messages.
   * This function supports text and file attachments.
   */
  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      // Compacting is not allowed to be stopped.
      if (newCompactTaskPending) return;

      const content = input.trim();
      const allMessages = [...queuedMessages];
      if (content) {
        allMessages.push(content);
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
          const uploadedAttachments = await upload();

          sendMessage({
            text: allMessages.join("\n") || " ",
            files: uploadedAttachments,
          });

          setInput("");
          setQueuedMessages([]);
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (allMessages.length > 0) {
        autoApproveGuard.current = true;
        clearUploadError();
        sendMessage({
          text: allMessages.join("\n\n"),
        });
        setInput("");
        setQueuedMessages([]);
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
      clearUploadError,
      newCompactTaskPending,
      queuedMessages,
      setQueuedMessages,
    ],
  );

  /**
   * Submits only the queued messages.
   * This is for text-only messages and does not include the current input.
   */
  const handleSubmitQueuedMessages = useCallback(async () => {
    // Compacting is not allowed to be stopped.
    if (newCompactTaskPending) return;

    if (isSubmitDisabled && queuedMessages.length === 0) {
      return;
    }

    if (handleStop()) {
      // break isLoading, we need to wait for some time to avoid racing between stop and submit.
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    autoApproveGuard.current = true;
    clearUploadError();
    sendMessage({
      text: queuedMessages.join("\n\n"),
    });
    setQueuedMessages([]);
  }, [
    isSubmitDisabled,
    handleStop,
    autoApproveGuard,
    sendMessage,
    clearUploadError,
    newCompactTaskPending,
    queuedMessages,
    setQueuedMessages,
  ]);

  return {
    handleSubmit,
    handleStop,
    handleSubmitQueuedMessages,
  };
}
