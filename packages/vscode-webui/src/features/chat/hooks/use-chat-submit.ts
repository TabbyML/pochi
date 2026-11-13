import type { PendingApproval } from "@/features/approval";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { prepareMessageParts } from "@/lib/message-utils";
import { vscodeHost } from "@/lib/vscode";
import type { UseChatHelpers } from "@ai-sdk/react";
import { type PastedTextFile, getLogger } from "@getpochi/common";
import type { Message, PendingInput, QueuedUserInput } from "@getpochi/livekit";

import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import { useLatest } from "@/lib/hooks/use-latest";
import type {
  ActiveSelection,
  Review,
  TerminalTextSelection,
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { FileUIPart } from "ai";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAutoApproveGuard,
  useBatchExecuteManager,
  useToolCallLifeCycle,
} from "../lib/chat-state";
import { resolveSlashMentions } from "./resolve-slash-mentions";
import type { ChatInput } from "./use-chat-input-state";
import type { QueuedUserInputDisplay } from "./use-pending-input-sink";

const logger = getLogger("UseChatSubmit");

type UseChatReturn = Pick<UseChatHelpers<Message>, "stop">;
type UseAttachmentUploadReturn = ReturnType<typeof useAttachmentUpload>;
type ResolvedChatInput = Extract<
  ReturnType<typeof resolveSlashMentions>,
  { status: "valid" }
> & { json: ChatInput["json"]; pastedTexts: string[] };

export interface DraftMessage {
  parts: Message["parts"];
  raw: {
    text?: string;
    filesCount?: number;
    reviewsCount?: number;
    terminalContextCount?: number;
    pastedTextCount?: number;
    isTodoMode?: boolean;
    activeSelection?: ActiveSelection;
    nonRemovable?: boolean;
  };
  /** Composer snapshot for re-editing. Consumed context is not restorable. */
  draft?: {
    input: ChatInput;
    attachments: FileUIPart[];
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
  /** The chat kit, which owns the input waiting for delivery. */
  pendingInputController: PendingInputController;
  reviews: Review[];
  skills: ValidSkillFile[];
  customAgents: ValidCustomAgentFile[];
  terminalContextSelections: TerminalTextSelection[];
  clearTerminalContextSelections: () => void;
  taskId: string;
  isTodoMode?: boolean;
  /** Clears the consumed Todo selection once message preparation succeeds. */
  onTodoModeSubmitted?: () => void;
}

export type PendingInputController = {
  readonly pendingInput: PendingInput;
  queueUserInput: (input: Omit<QueuedUserInput, "id">) => string;
  removeUserInput: (id: string) => QueuedUserInput | undefined;
  flushPendingInput: (options?: { automatic?: boolean }) => boolean;
};

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
  pendingInputController,
  reviews,
  skills,
  customAgents,
  terminalContextSelections,
  clearTerminalContextSelections,
  taskId,
  isTodoMode = false,
  onTodoModeSubmitted,
}: UseChatSubmitProps) {
  const autoApproveGuard = useAutoApproveGuard();
  const { isExecuting } = useToolCallLifeCycle();
  const batchExecuteManager = useBatchExecuteManager();
  const { t } = useTranslation();
  const [isPreparingMessage, setIsPreparingMessage] = useState(false);

  const abortExecutingToolCalls = useCallback(() => {
    batchExecuteManager.abort(taskId, "user-abort");
  }, [batchExecuteManager, taskId]);

  const activeSelection = useActiveSelection();

  const { stop: stopChat } = chat;
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

  const validateInput = useCallback(
    async (submittedInput: ChatInput = input) => {
      const result = resolveSlashMentions(submittedInput, skills, customAgents);
      if (result.status === "valid") {
        return {
          ...result,
          json: submittedInput.json,
          pastedTexts: submittedInput.pastedTexts ?? [],
        };
      }

      await vscodeHost.showWarningMessage(result.message, { modal: false });
      return undefined;
    },
    [input, skills, customAgents],
  );

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

  const createMessage = useCallback(
    async (
      resolvedInput: ResolvedChatInput = {
        status: "valid",
        text: input.text,
        invokedSkills: [],
        invokedCustomAgents: [],
        json: input.json,
        pastedTexts: input.pastedTexts ?? [],
      },
    ): Promise<DraftMessage | undefined> => {
      const text = resolvedInput.text.trim();
      const currentFiles = [...files];
      const currentReviews = [...reviews];
      const currentTerminalContextSelections = [...terminalContextSelections];
      const currentPastedTexts = [...resolvedInput.pastedTexts];

      if (
        text.length === 0 &&
        currentFiles.length === 0 &&
        currentReviews.length === 0 &&
        currentTerminalContextSelections.length === 0 &&
        currentPastedTexts.length === 0
      ) {
        return undefined;
      }

      // Capture the user's selection context (editor) right now.
      const currentSelection = activeSelection;

      let uploadedAttachments: FileUIPart[] = [];
      if (currentFiles.length > 0) {
        try {
          logger.debug("Uploading files...");
          uploadedAttachments = await upload();
          logger.debug("Files uploaded.");
        } catch (error) {
          // Error is already handled by the hook
          return undefined;
        }
      }

      let pastedTextFiles: PastedTextFile[] = [];
      if (currentPastedTexts.length > 0) {
        try {
          pastedTextFiles = await vscodeHost.persistPastedTextFiles(
            taskId,
            currentPastedTexts,
          );
        } catch {
          // The extension host reports the persistence error to the user.
          return undefined;
        }
      }

      clearUploadError();
      clearInput();
      if (currentFiles.length > 0) {
        clearFiles();
      }
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
        terminalContextCount: currentTerminalContextSelections.length,
        ...(currentPastedTexts.length > 0
          ? { pastedTextCount: currentPastedTexts.length }
          : {}),
        isTodoMode,
        activeSelection: currentSelection,
      };
      const parts = prepareMessageParts(
        t,
        text,
        uploadedAttachments,
        currentReviews,
        currentSelection,
        currentTerminalContextSelections,
        resolvedInput.invokedSkills,
        resolvedInput.invokedCustomAgents,
        pastedTextFiles,
      );
      const draft = {
        input: {
          json: resolvedInput.json,
          text: resolvedInput.text,
          pastedTexts: currentPastedTexts,
        },
        attachments: uploadedAttachments,
      };

      if (isTodoMode) {
        onTodoModeSubmitted?.();
      }
      return { parts, raw, draft };
    },
    [
      t,
      input.text,
      input.json,
      input.pastedTexts,
      files,
      reviews,
      terminalContextSelections,
      clearTerminalContextSelections,
      activeSelection,
      upload,
      clearFiles,
      clearUploadError,
      clearInput,
      isTodoMode,
      onTodoModeSubmitted,
      taskId,
    ],
  );

  /**
   * Delivers all pending input, queued user messages and background job
   * notifications alike, as one message right away.
   *
   * @returns true when a turn was started for it.
   */
  const sendPendingInput = useCallback(
    ({ automatic = false }: { automatic?: boolean } = {}) => {
      const hasUserInputs =
        pendingInputController.pendingInput.userInputs.length > 0;
      if (!pendingInputController.flushPendingInput({ automatic })) {
        return false;
      }
      // User input and explicit steering resume the agent, also after a stop.
      // Notifications delivered on their own leave the guard alone.
      if (hasUserInputs || !automatic) {
        if (pendingApproval?.name === "retry") {
          pendingApproval.stopCountdown();
        }
        autoApproveGuard.current = "auto";
      }
      return true;
    },
    [pendingInputController, pendingApproval, autoApproveGuard],
  );

  const queueMessage = useCallback(
    (message: DraftMessage) => {
      const display: QueuedUserInputDisplay = {
        raw: message.raw,
        draft: message.draft,
      };
      pendingInputController.queueUserInput({ parts: message.parts, display });
    },
    [pendingInputController],
  );

  // Tool approval and chat status can change while attachments are uploaded or
  // pasted text is persisted. Decide how to submit using the latest state.
  const submissionState = useLatest({
    allowSendMessage,
    isRunning,
    handleStop,
    waitForReady,
    sendPendingInput,
  });

  /** Interrupts the agent if needed, then sends all pending input. */
  const steerPendingInput = useCallback(async () => {
    const { allowSendMessage, isRunning, handleStop, waitForReady } =
      submissionState.current;
    let readyToSend = allowSendMessage;
    if (isRunning) {
      readyToSend = (await handleStop()) && (await waitForReady());
    }

    if (readyToSend) {
      submissionState.current.sendPendingInput({ automatic: false });
    }
  }, [submissionState]);

  const prepareMessage = useCallback(
    async (submittedInput?: ChatInput) => {
      setIsPreparingMessage(true);
      try {
        const resolvedInput = await validateInput(submittedInput);
        if (resolvedInput === undefined) {
          return undefined;
        }

        return await createMessage(resolvedInput);
      } finally {
        setIsPreparingMessage(false);
      }
    },
    [validateInput, createMessage],
  );

  /**
   * Handles form submission. The message is queued in the chat kit and sent
   * right away when the agent is ready; otherwise it rides along with the
   * agent's next request, or goes out once the agent stops.
   * Including text input, file attachments, reviews and active selections.
   */
  const handleSubmit = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement>,
      submittedInput?: ChatInput,
    ) => {
      e?.preventDefault();

      logger.debug("handleSubmit");

      if (!isSubmitEnabled || isPreparingMessage) {
        return;
      }

      const message = await prepareMessage(submittedInput);
      if (!message) {
        return;
      }

      queueMessage(message);
      if (submissionState.current.allowSendMessage) {
        submissionState.current.sendPendingInput();
      }
    },
    [
      isSubmitEnabled,
      isPreparingMessage,
      prepareMessage,
      queueMessage,
      submissionState,
    ],
  );

  /**
   * Queues the current input and interrupts the agent so all pending input is
   * sent right away.
   */
  const handleSteerSubmit = useCallback(
    async (
      e?: React.FormEvent<HTMLFormElement>,
      submittedInput?: ChatInput,
    ) => {
      e?.preventDefault();

      logger.debug("handleSteerSubmit");

      if (!isSubmitEnabled || isPreparingMessage) {
        return;
      }

      const message = await prepareMessage(submittedInput);
      if (!message) {
        return;
      }

      queueMessage(message);
      await steerPendingInput();
    },
    [
      isSubmitEnabled,
      isPreparingMessage,
      prepareMessage,
      queueMessage,
      steerPendingInput,
    ],
  );

  /** Interrupts the agent so all pending input is sent right away. */
  const handleSteer = useCallback(async () => {
    logger.debug("handleSteer");

    if (!allowSteer) {
      return;
    }

    await steerPendingInput();
  }, [allowSteer, steerPendingInput]);

  return {
    isPreparingMessage,
    handleSubmit,
    handleSteerSubmit,
    handleSteer,
    sendPendingInput,
    handleStop,
  };
}
