import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { prepareMessageParts } from "@/lib/message-utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";

import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import { useUserEdits } from "@/lib/hooks/use-user-edits";
import type { Review } from "@getpochi/common/vscode-webui-bridge";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useAutoApproveGuard,
  useBatchExecuteManager,
  useToolCallLifeCycle,
} from "../lib/chat-state";
import type { BlockingState } from "./use-blocking-operations";
import type { ChatInput } from "./use-chat-input-state";

const logger = getLogger("UseChatSubmit");

type UseChatReturn = Pick<UseChatHelpers<Message>, "sendMessage" | "stop">;

type UseAttachmentUploadReturn = ReturnType<typeof useAttachmentUpload>;

interface SubmitOptions {
  flushQueuedMessages?: boolean;
}

interface UseChatSubmitProps {
  chat: UseChatReturn;
  input: ChatInput;
  clearInput: () => void;
  attachmentUpload: UseAttachmentUploadReturn;
  isSubmitDisabled: boolean;
  isLoading: boolean;
  blockingState: BlockingState;
  pendingApproval: PendingApproval | undefined;
  queuedMessages: string[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<string[]>>;
  reviews: Review[];
  taskId: string;
}

export function useChatSubmit({
  chat,
  input,
  clearInput,
  attachmentUpload,
  isSubmitDisabled,
  isLoading,
  blockingState,
  pendingApproval,
  queuedMessages,
  setQueuedMessages,
  reviews,
  taskId,
}: UseChatSubmitProps) {
  const autoApproveGuard = useAutoApproveGuard();
  const { isExecuting } = useToolCallLifeCycle();
  const batchExecuteManager = useBatchExecuteManager();
  const { t } = useTranslation();

  const abortExecutingToolCalls = useCallback(() => {
    batchExecuteManager.abort(taskId, "user-abort");
  }, [batchExecuteManager, taskId]);

  const userEdits = useUserEdits(taskId);
  const activeSelection = useActiveSelection();

  const { sendMessage, stop: stopChat } = chat;
  const {
    files,
    isUploading,
    upload,
    clearFiles,
    clearError: clearUploadError,
  } = attachmentUpload;

  const handleStop = useCallback(() => {
    // Compacting is not allowed to be stopped.
    if (blockingState.isBusy) return;

    if (isExecuting) {
      abortExecutingToolCalls();
      return true;
    }

    if (isLoading) {
      stopChat();
      return true;
    }

    if (pendingApproval?.name === "retry") {
      pendingApproval.stopCountdown();
    }
  }, [
    blockingState.isBusy,
    isExecuting,
    isLoading,
    pendingApproval,
    abortExecutingToolCalls,
    stopChat,
  ]);

  const queueCurrentInput = useCallback(() => {
    const content = input.text.trim();
    if (!content) return false;

    setQueuedMessages((prev) => [...prev, content]);
    clearInput();
    return true;
  }, [clearInput, input.text, setQueuedMessages]);

  /**
   * Handles form submission, sending both the current input and any queued messages.
   * This function supports text and file attachments.
   */
  const handleSubmit = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement>,
      options: SubmitOptions = {},
    ) => {
      e?.preventDefault();

      logger.debug("handleSubmit");

      // Uploading / Compacting is not allowed to be stopped.
      if (blockingState.isBusy || isUploading) return;

      if (isLoading || isExecuting) {
        // The queued message store only supports text. Keep attachments and
        // review submissions in the editor until the current run is ready.
        if (files.length === 0 && reviews.length === 0) {
          queueCurrentInput();
        }
        return;
      }

      const content = input.text.trim();
      const shouldQueueCurrentInput =
        !options.flushQueuedMessages &&
        queuedMessages.length > 0 &&
        content.length > 0;
      if (shouldQueueCurrentInput) {
        // When a queue already exists, an explicit user submission keeps
        // building the queue. The ready effect is responsible for flushing it.
        if (files.length === 0 && reviews.length === 0) {
          queueCurrentInput();
        }
        return;
      }

      const hasQueuedMessages = queuedMessages.length > 0;
      const text = options.flushQueuedMessages
        ? (queuedMessages[0]?.trim() ?? "")
        : hasQueuedMessages
          ? content.length > 0
            ? ""
            : (queuedMessages[0]?.trim() ?? "")
          : content;

      // Disallow empty submissions
      if (text.length === 0 && files.length === 0 && reviews.length === 0)
        return;

      if (isSubmitDisabled) {
        return;
      }

      if (pendingApproval?.name === "retry") {
        pendingApproval.stopCountdown();
      }

      // Send queued messages one at a time. The ready effect will flush the
      // next queued message after the current one finishes.
      setQueuedMessages(hasQueuedMessages ? queuedMessages.slice(1) : []);
      if (!options.flushQueuedMessages && content) {
        clearInput();
      }

      if (files.length > 0) {
        try {
          logger.debug("Uploading files...");
          const uploadedAttachments = await upload();
          const parts = prepareMessageParts(
            t,
            text,
            uploadedAttachments,
            reviews,
            userEdits,
            activeSelection,
          );
          logger.debug("Sending message with files");

          clearFiles();
          autoApproveGuard.current = "auto";
          await sendMessage({
            parts,
          });
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (text.length > 0 || reviews.length > 0) {
        clearUploadError();
        const parts = prepareMessageParts(
          t,
          text,
          [],
          reviews,
          userEdits,
          activeSelection,
        );

        autoApproveGuard.current = "auto";
        await sendMessage({
          parts,
        });
      }
    },
    [
      isSubmitDisabled,
      files.length,
      input,
      autoApproveGuard,
      upload,
      sendMessage,
      clearInput,
      clearUploadError,
      blockingState.isBusy,
      queuedMessages,
      setQueuedMessages,
      isUploading,
      t,
      clearFiles,
      reviews,
      userEdits,
      activeSelection,
      isLoading,
      isExecuting,
      queueCurrentInput,
      pendingApproval,
    ],
  );

  const handleSteerSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      logger.debug("handleSteerSubmit");

      if (blockingState.isBusy || isUploading) return;

      if (isLoading || isExecuting) {
        if (files.length === 0 && reviews.length === 0) {
          queueCurrentInput();
        }
        autoApproveGuard.current = "stop";
        handleStop();
        return;
      }

      await handleSubmit(e);
    },
    [
      autoApproveGuard,
      blockingState.isBusy,
      files.length,
      handleStop,
      handleSubmit,
      isExecuting,
      isLoading,
      isUploading,
      queueCurrentInput,
      reviews.length,
    ],
  );

  return {
    handleSubmit,
    handleSteerSubmit,
    handleStop,
  };
}
