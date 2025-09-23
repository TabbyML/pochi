import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import type { UseChatHelpers } from "@ai-sdk/react";
import { prompts } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import type { FileUIPart } from "ai";
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
      if (isSubmitDisabled) return;

      const allMessages = [...queuedMessages];
      // Clear queued messages after adding them to allMessages
      setQueuedMessages([]);

      const content = input.trim();
      if (content) {
        allMessages.push(content);
      }

      if (handleStop()) {
        // break isLoading, we need to wait for some time to avoid racing between stop and submit.
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      autoApproveGuard.current = "stop";
      if (files.length > 0) {
        try {
          const uploadedAttachments = await upload();
          const parts = prepareMessageParts(
            allMessages.join("\n"),
            uploadedAttachments,
          );

          sendMessage({
            parts,
          });

          setInput("");
          autoApproveGuard.current = "auto";
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (allMessages.length > 0) {
        clearUploadError();
        sendMessage({
          text: allMessages.join("\n\n"),
        });
        setInput("");
        autoApproveGuard.current = "auto";
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

    if (isSubmitDisabled || queuedMessages.length === 0) {
      return;
    }

    if (handleStop()) {
      // break isLoading, we need to wait for some time to avoid racing between stop and submit.
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    autoApproveGuard.current = "auto";
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

function prepareMessageParts(input: string, files: FileUIPart[]) {
  const parts: Message["parts"] = [...files];
  parts.push({
    type: "text",
    text: prompts.createSystemReminder(
      `Attached files: ${files.map((file) => file.url).join(", ")}`,
    ),
  });
  if (input) {
    parts.push({ type: "text", text: input });
  }
  return parts;
}
