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
          const uploadedAttachments = await upload();
          const parts = prepareMessageParts(content, uploadedAttachments);

          sendMessage({
            parts,
          });

          setInput("");
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (content.length > 0) {
        autoApproveGuard.current = true;
        clearUploadError();
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
      clearUploadError,
      newCompactTaskPending,
    ],
  );

  return { handleSubmit, handleStop };
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
