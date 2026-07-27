import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { prepareMessageParts } from "@/lib/message-utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import type { UseChatHelpers } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";

import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import { useUserEdits } from "@/lib/hooks/use-user-edits";
import type {
  ActiveSelection,
  Review,
  TerminalTextSelection,
} from "@getpochi/common/vscode-webui-bridge";
import type { FileUIPart } from "ai";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
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

export interface DraftMessage {
  parts: Message["parts"];
  raw: {
    text?: string;
    filesCount?: number;
    reviewsCount?: number;
    userEditsCount?: number;
    isTodoMode?: boolean;
    activeSelection?: ActiveSelection;
    activeTerminalTextSelection?: TerminalTextSelection;
  };
}

interface UseChatSubmitProps {
  chat: UseChatReturn;
  input: ChatInput;
  clearInput: () => void;
  attachmentUpload: UseAttachmentUploadReturn;
  isSubmitDisabled: boolean;
  isLoading: boolean;
  isPendingToolCall: boolean;
  blockingState: BlockingState;
  pendingApproval: PendingApproval | undefined;
  queuedMessages: DraftMessage[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<DraftMessage[]>>;
  reviews: Review[];
  taskId: string;
  includeUserEdits?: boolean;
  isTodoMode?: boolean;
  canCreateTodo?: boolean;
  onTodoModeQueued?: () => void;
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
  isPendingToolCall,
  blockingState,
  pendingApproval,
  queuedMessages,
  setQueuedMessages,
  reviews,
  taskId,
  includeUserEdits = true,
  isTodoMode = false,
  canCreateTodo = true,
  onTodoModeQueued,
  onBeforeSendText,
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

  const readyResolvers = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!isLoading && !isExecuting && readyResolvers.current.length > 0) {
      const resolvers = readyResolvers.current;
      readyResolvers.current = [];
      for (const resolve of resolvers) {
        resolve();
      }
    }
  }, [isLoading, isExecuting]);

  const waitForReady = useCallback(() => {
    if (!isLoading && !isExecuting) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      readyResolvers.current.push(resolve);
    });
  }, [isLoading, isExecuting]);

  const handleStop = useCallback(async () => {
    autoApproveGuard.current = "stop";

    // Compacting is not allowed to be stopped.
    if (blockingState.isBusy) {
      return false;
    }

    if (isExecuting) {
      abortExecutingToolCalls();
    }

    if (isLoading) {
      stopChat();
    }

    if (pendingApproval?.name === "retry") {
      pendingApproval.stopCountdown();
    }

    await waitForReady();
    return true;
  }, [
    blockingState.isBusy,
    isExecuting,
    isLoading,
    pendingApproval,
    abortExecutingToolCalls,
    stopChat,
    autoApproveGuard,
    waitForReady,
  ]);

  const createMessage = useCallback(async (): Promise<
    DraftMessage | undefined
  > => {
    const text = input.text.trim();
    const currentFiles = [...files];
    const currentReviews = [...reviews];

    if (
      text.length === 0 &&
      currentFiles.length === 0 &&
      currentReviews.length === 0
    ) {
      return undefined;
    }

    // Capture the user's selection context (editor + terminal) right now.
    const currentUserEdits = includeUserEdits ? [...userEdits] : [];
    const currentSelection = activeSelection;

    // Terminal selection can only be read on demand (there's no reactive
    // VS Code API for it), so this is the only chance to snapshot it.
    const currentTerminalTextSelection = isVSCodeEnvironment()
      ? await vscodeHost.readTerminalSelection()
      : undefined;

    let uploadedAttachments: FileUIPart[] = [];
    if (currentFiles.length > 0) {
      try {
        logger.debug("Uploading files...");
        uploadedAttachments = await upload();
        logger.debug("Files uploaded.");
        clearFiles();
      } catch (error) {
        // Error is already handled by the hook
        return undefined;
      }
    }

    clearUploadError();
    clearInput();
    if (currentReviews.length > 0) {
      vscodeHost.deleteReviews(currentReviews.map((review) => review.id));
    }

    const raw = {
      text,
      filesCount: currentFiles.length,
      reviewsCount: currentReviews.length,
      userEditsCount: currentUserEdits.length,
      isTodoMode,
      activeSelection: currentSelection,
      activeTerminalTextSelection: currentTerminalTextSelection,
    };
    const parts = prepareMessageParts(
      t,
      text,
      uploadedAttachments,
      currentReviews,
      currentUserEdits,
      currentSelection,
      currentTerminalTextSelection,
    );

    return { parts, raw };
  }, [
    t,
    input.text,
    files,
    reviews,
    userEdits,
    includeUserEdits,
    activeSelection,
    upload,
    clearFiles,
    clearUploadError,
    clearInput,
    isTodoMode,
  ]);

  const sendChatMessage = useCallback(
    async (message: DraftMessage) => {
      if (isSubmitDisabled) {
        return;
      }

      const shouldCreateTodo = message.raw.isTodoMode && canCreateTodo;
      if (message.raw.text && shouldCreateTodo) {
        onBeforeSendText?.(message.raw.text);
      }

      if (pendingApproval?.name === "retry") {
        pendingApproval.stopCountdown();
      }

      autoApproveGuard.current = "auto";
      await sendMessage({
        parts: message.parts,
      });
    },
    [
      isSubmitDisabled,
      canCreateTodo,
      onBeforeSendText,
      pendingApproval,
      autoApproveGuard,
      sendMessage,
    ],
  );

  /**
   * Handles form submission, send the current input to chat if not running, otherwise send it to the message queue.
   * Including text input, file attachments, reviews and active selections.
   */
  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      logger.debug("handleSubmit");

      // Uploading / Compacting is not allowed to be stopped.
      if (blockingState.isBusy || isUploading) return;

      const message = await createMessage();
      if (!message) {
        return;
      }

      if (isLoading || isExecuting || isPendingToolCall) {
        setQueuedMessages((prev) => [...prev, message]);
        if (message.raw.isTodoMode) {
          onTodoModeQueued?.();
        }
        return;
      }

      sendChatMessage(message);
    },
    [
      blockingState.isBusy,
      isUploading,
      isLoading,
      isExecuting,
      isPendingToolCall,
      sendChatMessage,
      setQueuedMessages,
      createMessage,
      onTodoModeQueued,
    ],
  );

  const handleSteerSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      logger.debug("handleSteerSubmit");

      if (blockingState.isBusy || isUploading) return;

      const message = await createMessage();
      if (!message) {
        return;
      }

      let ready = !isLoading && !isExecuting && !isPendingToolCall;
      if (!ready) {
        ready = await handleStop();
      }

      if (ready) {
        sendChatMessage(message);
      } else {
        setQueuedMessages((messages) => [...messages, message]);
      }
    },
    [
      blockingState.isBusy,
      isUploading,
      isLoading,
      isExecuting,
      isPendingToolCall,
      sendChatMessage,
      createMessage,
      handleStop,
      setQueuedMessages,
    ],
  );

  const handleSteerQueuedMessage = useCallback(
    async (index: number) => {
      if (blockingState.isBusy) return;

      const messages = [...queuedMessages];
      const message = messages[index];
      if (message) {
        const updatedMessages = messages.filter((_, i) => i !== index);
        setQueuedMessages(updatedMessages);

        let ready = !isLoading && !isExecuting && !isPendingToolCall;
        if (!ready) {
          ready = await handleStop();
        }
        if (ready) {
          sendChatMessage(message);
        } else {
          setQueuedMessages(messages);
        }
      }
    },
    [
      blockingState.isBusy,
      isLoading,
      isExecuting,
      isPendingToolCall,
      handleStop,
      queuedMessages,
      setQueuedMessages,
      sendChatMessage,
    ],
  );

  return {
    handleSubmit,
    handleSteerSubmit,
    handleSteerQueuedMessage,
    handleStop,
  };
}
