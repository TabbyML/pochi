import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import type { UseChatHelpers } from "@ai-sdk/react";
import { getLogger, prompts } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { isAutoExecuteToolName } from "@getpochi/tools";
import type { FileUIPart } from "ai";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";

const logger = getLogger("UseChatSubmit");

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
  const { t } = useTranslation();
  const isExecuting = executingToolCalls.length > 0;
  const isPreviewing = (previewingToolCalls?.length ?? 0) > 0;

  const abortExecutingToolCalls = useCallback(() => {
    for (const toolCall of executingToolCalls) {
      toolCall.abort();
    }
  }, [executingToolCalls]);

  const abortPreviewingToolCalls = useCallback(() => {
    for (const toolCall of previewingToolCalls || []) {
      if (!isAutoExecuteToolName(toolCall.toolName)) {
        toolCall.abort();
      }
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

      logger.debug("handleSubmit");

      // Compacting is not allowed to be stopped.
      if (newCompactTaskPending) return;

      const allMessages = [...queuedMessages];
      // Clear queued messages after adding them to allMessages
      setQueuedMessages([]);

      const content = input.trim();
      if (content) {
        allMessages.push(content);
        setInput("");
      }
      const text = allMessages.join("\n\n").trim();

      // Disallow empty submissions
      if (text.length === 0 && files.length === 0) return;

      const stopIsLoading = handleStop();
      if (stopIsLoading || isSubmitDisabled) {
        autoApproveGuard.current = "stop";
        if (text.length > 0) {
          setQueuedMessages([text]);
        }
        return;
      }

      if (files.length > 0) {
        try {
          logger.debug("Uploading files...");
          const uploadedAttachments = await upload();
          const parts = prepareMessageParts(text, uploadedAttachments, t);
          logger.debug("Sending message with files");

          await sendMessage({
            parts,
          });

          autoApproveGuard.current = "auto";
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (allMessages.length > 0) {
        clearUploadError();
        const parts = prepareMessageParts(text, [], t);
        await sendMessage({
          parts,
        });
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
      t,
    ],
  );

  return {
    handleSubmit,
    handleStop,
  };
}

function prepareMessageParts(
  input: string,
  files: FileUIPart[],
  t: ReturnType<typeof useTranslation>["t"],
) {
  const parts: Message["parts"] = [...files];
  if (files.length > 0) {
    parts.push({
      type: "text",
      text: prompts.createSystemReminder(
        `Attached files: ${files.map(getFilePrompt).join(", ")}`,
      ),
    });
  }
  parts.push({ type: "text", text: input || t("chat.pleaseCheckFiles") });
  return parts;
}

function getFilePrompt(file: FileUIPart, index: number): string {
  const filename = file.filename || `file-${index}`;
  if (file.url.startsWith("http")) {
    return `[${filename}](${file.url})`;
  }
  return filename;
}
