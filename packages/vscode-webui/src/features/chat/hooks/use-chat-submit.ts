import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { prepareMessageParts } from "@/lib/message-utils";
import { vscodeHost } from "@/lib/vscode";
import type { UseChatHelpers } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import type {
  MonitorEventEnvelope,
  SubAgentResultNotification,
} from "@getpochi/common";
import type { Message } from "@getpochi/livekit";

import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import type {
  ActiveSelection,
  FileDiff,
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
    terminalContextCount?: number;
    isTodoMode?: boolean;
    activeSelection?: ActiveSelection;
    /** Present when this draft was generated from monitor events. */
    monitor?: {
      backgroundJobId: string;
      description: string;
      /**
       * The envelopes rendered into this draft. Kept so that events arriving
       * while the draft is still queued can be merged into it (re-rendered as
       * one notification) instead of enqueuing another message.
       */
      envelopes: MonitorEventEnvelope[];
    };
    /**
     * Present when this draft was generated from finished background
     * subagents. Kept so results arriving while the draft is still queued
     * are merged into one message.
     */
    subagentResults?: SubAgentResultNotification[];
  };
}

interface UseChatSubmitProps {
  chat: UseChatReturn;
  input: ChatInput;
  clearInput: () => void;
  attachmentUpload: UseAttachmentUploadReturn;
  isLoading: boolean;
  isRunning: boolean;
  isSubmitEnabled: boolean;
  isStopEnabled: boolean;
  allowSendMessage: boolean;
  allowSteer: boolean;
  pendingApproval: PendingApproval | undefined;
  queuedMessages: DraftMessage[];
  setQueuedMessages: React.Dispatch<React.SetStateAction<DraftMessage[]>>;
  reviews: Review[];
  userEdits: FileDiff[];
  terminalContextSelections: TerminalTextSelection[];
  clearTerminalContextSelections: () => void;
  taskId: string;
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
  isLoading,
  isRunning,
  isSubmitEnabled,
  isStopEnabled,
  allowSendMessage,
  allowSteer,
  pendingApproval,
  queuedMessages,
  setQueuedMessages,
  reviews,
  userEdits,
  terminalContextSelections,
  clearTerminalContextSelections,
  taskId,
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

  const activeSelection = useActiveSelection();

  const { sendMessage, stop: stopChat } = chat;
  const {
    files,
    upload,
    clearFiles,
    clearError: clearUploadError,
  } = attachmentUpload;

  const readyResolvers = useRef<((r: true) => void)[]>([]);

  useEffect(() => {
    if (allowSendMessage && readyResolvers.current.length > 0) {
      const resolvers = readyResolvers.current;
      readyResolvers.current = [];
      for (const resolve of resolvers) {
        resolve(true);
      }
    }
  }, [allowSendMessage]);

  const waitForReady = useCallback(() => {
    if (allowSendMessage) {
      return Promise.resolve(true);
    }
    return new Promise<true>((resolve) => {
      readyResolvers.current.push(resolve);
    });
  }, [allowSendMessage]);

  const handleStop = useCallback(async () => {
    if (!isStopEnabled) {
      return false;
    }

    autoApproveGuard.current = "stop";

    if (isExecuting) {
      abortExecutingToolCalls();
    }

    if (isLoading) {
      stopChat();
    }

    if (pendingApproval?.name === "retry") {
      pendingApproval.stopCountdown();
    }
    return true;
  }, [
    isStopEnabled,
    isExecuting,
    isLoading,
    pendingApproval,
    abortExecutingToolCalls,
    stopChat,
    autoApproveGuard,
  ]);

  const createMessage = useCallback(async (): Promise<
    DraftMessage | undefined
  > => {
    const text = input.text.trim();
    const currentFiles = [...files];
    const currentReviews = [...reviews];
    const currentTerminalContextSelections = [...terminalContextSelections];

    if (
      text.length === 0 &&
      currentFiles.length === 0 &&
      currentReviews.length === 0 &&
      currentTerminalContextSelections.length === 0
    ) {
      return undefined;
    }

    // Capture the user's selection context (editor) right now.
    const currentUserEdits = [...userEdits];
    const currentSelection = activeSelection;

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
    if (currentTerminalContextSelections.length > 0) {
      clearTerminalContextSelections();
    }

    const raw = {
      text,
      filesCount: currentFiles.length,
      reviewsCount: currentReviews.length,
      userEditsCount: currentUserEdits.length,
      terminalContextCount: currentTerminalContextSelections.length,
      isTodoMode,
      activeSelection: currentSelection,
    };
    const parts = prepareMessageParts(
      t,
      text,
      uploadedAttachments,
      currentReviews,
      currentUserEdits,
      currentSelection,
      currentTerminalContextSelections,
    );

    return { parts, raw };
  }, [
    t,
    input.text,
    files,
    reviews,
    userEdits,
    terminalContextSelections,
    clearTerminalContextSelections,
    activeSelection,
    upload,
    clearFiles,
    clearUploadError,
    clearInput,
    isTodoMode,
  ]);

  const sendChatMessage = useCallback(
    async (message: DraftMessage) => {
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

      if (!isSubmitEnabled) {
        return;
      }

      const message = await createMessage();
      if (!message) {
        return;
      }

      if (allowSendMessage) {
        sendChatMessage(message);
      } else {
        setQueuedMessages((prev) => [...prev, message]);
        if (message.raw.isTodoMode) {
          onTodoModeQueued?.();
        }
      }
    },
    [
      isSubmitEnabled,
      allowSendMessage,
      sendChatMessage,
      createMessage,
      setQueuedMessages,
      onTodoModeQueued,
    ],
  );

  const handleSteerSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      logger.debug("handleSteerSubmit");

      if (!isSubmitEnabled) {
        return;
      }

      const message = await createMessage();
      if (!message) {
        return;
      }

      let readyToSend = allowSendMessage;
      if (isRunning) {
        readyToSend = (await handleStop()) && (await waitForReady());
      }

      if (readyToSend) {
        sendChatMessage(message);
      } else {
        setQueuedMessages((messages) => [...messages, message]);
        if (message.raw.isTodoMode) {
          onTodoModeQueued?.();
        }
      }
    },
    [
      isSubmitEnabled,
      isRunning,
      allowSendMessage,
      sendChatMessage,
      createMessage,
      handleStop,
      waitForReady,
      setQueuedMessages,
      onTodoModeQueued,
    ],
  );

  const handleSteerQueuedMessage = useCallback(
    async (index: number) => {
      logger.debug("handleSteerQueuedMessage");

      if (!allowSteer) {
        return;
      }

      const messages = [...queuedMessages];
      const message = messages[index];
      if (message) {
        const updatedMessages = messages.filter((_, i) => i !== index);
        setQueuedMessages(updatedMessages);

        let readyToSend = allowSendMessage;
        if (isRunning) {
          readyToSend = (await handleStop()) && (await waitForReady());
        }

        if (readyToSend) {
          sendChatMessage(message);
        }
      }
    },
    [
      allowSteer,
      allowSendMessage,
      isRunning,
      handleStop,
      waitForReady,
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
