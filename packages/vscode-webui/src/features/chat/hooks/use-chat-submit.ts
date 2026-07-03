import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { prepareMessageParts } from "@/lib/message-utils";
import { vscodeHost } from "@/lib/vscode";
import type { UseChatHelpers } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";

import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import { useUserEdits } from "@/lib/hooks/use-user-edits";
import type { Review } from "@getpochi/common/vscode-webui-bridge";
import type React from "react";
import { useCallback, useRef } from "react";
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

export interface QueuedMessage {
  text: string;
  files: File[];
  reviews: Review[];
}

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
  queuedMessages: QueuedMessage[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  reviews: Review[];
  taskId: string;
  /**
   * Invoked with the final submitted text right before the message is sent.
   * Used e.g. to seed a todo from the message when todo mode is selected.
   */
  onBeforeSendText?: (text: string) => void;
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
  onBeforeSendText,
}: UseChatSubmitProps) {
  const autoApproveGuard = useAutoApproveGuard();
  const { isExecuting } = useToolCallLifeCycle();
  const batchExecuteManager = useBatchExecuteManager();
  const { t } = useTranslation();
  const pendingSteerMessageRef = useRef<QueuedMessage | undefined>(undefined);

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
    uploadFiles,
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

  const createCurrentMessage = useCallback(() => {
    const currentMessage: QueuedMessage = {
      text: input.text.trim(),
      files: [...files],
      reviews: [...reviews],
    };

    if (
      currentMessage.text.length === 0 &&
      currentMessage.files.length === 0 &&
      currentMessage.reviews.length === 0
    ) {
      return undefined;
    }

    return currentMessage;
  }, [files, input.text, reviews]);

  const clearCurrentMessage = useCallback(
    (currentMessage: QueuedMessage) => {
      clearInput();
      if (currentMessage.files.length > 0) {
        clearFiles();
      }
      if (currentMessage.reviews.length > 0) {
        vscodeHost.deleteReviews(
          currentMessage.reviews.map((review) => review.id),
        );
      }
    },
    [clearFiles, clearInput],
  );

  const queueCurrentInput = useCallback(() => {
    const queuedMessage = createCurrentMessage();
    if (!queuedMessage) return false;

    setQueuedMessages((prev) => [...prev, queuedMessage]);
    clearCurrentMessage(queuedMessage);
    return true;
  }, [clearCurrentMessage, createCurrentMessage, setQueuedMessages]);

  const queuePendingSteerInput = useCallback(() => {
    const queuedMessage = createCurrentMessage();
    if (!queuedMessage) return false;

    pendingSteerMessageRef.current = queuedMessage;
    clearCurrentMessage(queuedMessage);
    return true;
  }, [clearCurrentMessage, createCurrentMessage]);

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
        queueCurrentInput();
        return;
      }

      const content = input.text.trim();
      const hasQueueableCurrentMessage =
        content.length > 0 || files.length > 0 || reviews.length > 0;
      const shouldQueueCurrentInput =
        !options.flushQueuedMessages &&
        queuedMessages.length > 0 &&
        hasQueueableCurrentMessage;
      if (shouldQueueCurrentInput) {
        // When a queue already exists, an explicit user submission keeps
        // building the queue. The ready effect is responsible for flushing it.
        queueCurrentInput();
        return;
      }

      const hasQueuedMessages = queuedMessages.length > 0;
      const pendingSteerMessage = options.flushQueuedMessages
        ? pendingSteerMessageRef.current
        : undefined;
      const shouldUseQueuedMessage =
        options.flushQueuedMessages ||
        (hasQueuedMessages && !hasQueueableCurrentMessage);
      const queuedMessage =
        pendingSteerMessage ??
        (shouldUseQueuedMessage ? queuedMessages[0] : undefined);
      const hasPendingSteerMessage = !!pendingSteerMessage;
      const text = queuedMessage?.text ?? content;
      const messageFiles = queuedMessage?.files ?? files;
      const messageReviews = queuedMessage?.reviews ?? reviews;

      // Disallow empty submissions
      if (
        text.length === 0 &&
        messageFiles.length === 0 &&
        messageReviews.length === 0
      ) {
        return;
      }

      if (isSubmitDisabled) {
        return;
      }

      if (pendingApproval?.name === "retry") {
        pendingApproval.stopCountdown();
      }

      // Send queued messages one at a time. The ready effect will flush the
      // next queued message after the current one finishes.
      if (hasPendingSteerMessage) {
        pendingSteerMessageRef.current = undefined;
      } else {
        setQueuedMessages(hasQueuedMessages ? queuedMessages.slice(1) : []);
      }
      if (!options.flushQueuedMessages && content) {
        clearInput();
      }

      if (text.length > 0) {
        onBeforeSendText?.(text);
      }

      if (messageFiles.length > 0) {
        try {
          logger.debug("Uploading files...");
          const uploadedAttachments = queuedMessage
            ? await uploadFiles(messageFiles)
            : await upload();
          const parts = prepareMessageParts(
            t,
            text,
            uploadedAttachments,
            messageReviews,
            userEdits,
            activeSelection,
          );
          logger.debug("Sending message with files");

          if (!queuedMessage) {
            clearFiles();
          }
          autoApproveGuard.current = "auto";
          await sendMessage({
            parts,
          });
        } catch (error) {
          // Error is already handled by the hook
          return;
        }
      } else if (text.length > 0 || messageReviews.length > 0) {
        clearUploadError();
        const parts = prepareMessageParts(
          t,
          text,
          [],
          messageReviews,
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
      files,
      input,
      autoApproveGuard,
      upload,
      uploadFiles,
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
      onBeforeSendText,
    ],
  );

  const handleSteerSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      logger.debug("handleSteerSubmit");

      if (blockingState.isBusy || isUploading) return;

      const hasVisibleQueue = queuedMessages.length > 0;
      const isRunActive = isLoading || isExecuting;

      if (!hasVisibleQueue && !isRunActive) {
        await handleSubmit(e);
        return;
      }

      const didCaptureMessage = hasVisibleQueue
        ? queuePendingSteerInput()
        : queueCurrentInput();
      const shouldInterrupt =
        isRunActive && (hasVisibleQueue || didCaptureMessage);
      const shouldPauseAutoApprove = didCaptureMessage || shouldInterrupt;
      if (!shouldPauseAutoApprove) return;

      autoApproveGuard.current = "stop";
      if (shouldInterrupt) {
        handleStop();
        return;
      }
    },
    [
      autoApproveGuard,
      blockingState.isBusy,
      handleStop,
      handleSubmit,
      isExecuting,
      isLoading,
      isUploading,
      queueCurrentInput,
      queuePendingSteerInput,
      queuedMessages.length,
    ],
  );

  return {
    handleSubmit,
    handleSteerSubmit,
    handleStop,
  };
}
