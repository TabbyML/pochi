import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { DevModeButton } from "@/components/dev-mode-button";
import { ModelSelect } from "@/components/model-select";
import { TodoModeBadge } from "@/components/prompt-form/todo-mode-badge";
import { PublicShareButton } from "@/components/public-share-button";
import { TokenUsage } from "@/components/token-usage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApprovalButton,
  FixWidgetButton,
  isRetryApprovalCountingDown,
  type useApprovalAndRetry,
} from "@/features/approval";
import {
  AutoApproveMenu,
  useAutoApprove,
  useSelectedModels,
} from "@/features/settings";
import { type TodoCompletionUpdate, TodoList } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useReviews } from "@/lib/hooks/use-reviews";
import { useSkills } from "@/lib/hooks/use-skills";
import { cn, tw } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants } from "@getpochi/common";
import { hasActiveTodos } from "@getpochi/common/message-utils";
import type {
  DisplayModel,
  McpConfigOverride,
} from "@getpochi/common/vscode-webui-bridge";
import type { Message, PendingInput, Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import {
  SendHorizonal,
  ShieldCheck,
  ShieldOff,
  StopCircleIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type BlockingOperation,
  useBlockingOperations,
} from "../hooks/use-blocking-operations";
import { useChatInputState } from "../hooks/use-chat-input-state";
import { useChatStatus } from "../hooks/use-chat-status";
import {
  type DraftMessage,
  type PendingInputController,
  useChatSubmit,
} from "../hooks/use-chat-submit";
import { useInlineCompactTask } from "../hooks/use-inline-compact-task";
import { useNewCompactTask } from "../hooks/use-new-compact-task";
import { toDraftMessage } from "../hooks/use-pending-input-sink";
import { useShowCompleteSubtaskButton } from "../hooks/use-subtask-completed";
import type { SubtaskInfo } from "../hooks/use-subtask-info";
import { useTerminalContextState } from "../hooks/use-terminal-context-state";
import { BackgroundJobContextProvider } from "../lib/use-background-job-display";
import { BackgroundJobManagePanel } from "./background-job-manage-panel";
import { ChatInputForm, type ChatInputFormHandle } from "./chat-input-form";
import { ErrorMessageView } from "./error-message-view";
import { SubmitReviewsButton } from "./submit-review-button";
import { CompleteSubtaskButton } from "./subtask";

const PopupContainerClassName = tw`-translate-y-full -top-2 absolute left-0 w-full px-4 pt-1`;
const PopupContentClassName = tw`flex w-full flex-col bg-background`;
// `overflow-x-hidden` clips vertically too, so the row carries padding to keep
// room for anything hanging outside a control, such as the manage panel badge.
const FooterContainerClassName = tw`my-1 flex shrink-0 justify-between gap-5 overflow-x-hidden py-1`;
const FooterLeftClassName = tw`flex items-center gap-2 overflow-x-hidden truncate`;
const FooterRightClassName = tw`flex shrink-0 items-center gap-1`;

interface ChatToolbarProps {
  task?: Task;
  approvalAndRetry: ReturnType<typeof useApprovalAndRetry>;
  compact: () => Promise<string>;
  chat: UseChatHelpers<Message>;
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
  isSubTask: boolean;
  subtask?: SubtaskInfo;
  /** Makes an unlisted model available as the current selection. */
  modelOverride?: DisplayModel;
  displayError: Error | undefined;
  showRenderWidgetFixButton?: boolean;
  todos: Todo[];
  updateTodos: (todos: Todo[]) => void;
  updateTodoCompletion: (update: TodoCompletionUpdate) => void;
  todoPaused: boolean;
  onTodoPausedChange: (paused: boolean) => void;
  onUpdateIsPublicShared?: (isPublicShared: boolean) => void;
  taskId: string;
  isRepairingMermaid?: boolean;
  mcpConfigOverride?: McpConfigOverride;
  getSystemPrompt?: () => string | undefined;
  /** Input the chat kit has not delivered yet, mirrored for rendering. */
  pendingInput: PendingInput;
  /** The chat kit, which owns that input and decides when it is delivered. */
  pendingInputController: PendingInputController;
  persistToolOutput: () => void;
  onToolCallApprovalVisible?: () => void;
  onToolsExecutionStarted?: () => void;
  onToolsExecutionEnded?: () => void;
}

export const ChatToolbar: React.FC<ChatToolbarProps> = ({
  chat,
  approvalAndRetry: { pendingApproval, retry },
  compact,
  attachmentUpload,
  isSubTask,
  subtask,
  modelOverride,
  task,
  displayError,
  showRenderWidgetFixButton: shouldShowRenderWidgetFixButton,
  todos,
  updateTodos,
  updateTodoCompletion,
  todoPaused,
  onTodoPausedChange,
  onUpdateIsPublicShared,
  taskId,
  isRepairingMermaid = false,
  mcpConfigOverride,
  getSystemPrompt,
  pendingInput,
  pendingInputController,
  persistToolOutput,
  onToolCallApprovalVisible,
  onToolsExecutionStarted,
  onToolsExecutionEnded,
}) => {
  const { t } = useTranslation();

  const { messages, sendMessage, addToolOutput, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const totalTokens = task?.totalTokens || 0;
  const latestAssistantMessage = messages.findLast(
    (message) =>
      message.role === "assistant" && message.metadata?.kind === "assistant",
  );
  const latestAssistantMetadata =
    latestAssistantMessage?.metadata?.kind === "assistant"
      ? latestAssistantMessage.metadata
      : undefined;

  const { input, setInput, clearInput } = useChatInputState();
  const { skills, isLoading: isSkillsLoading } = useSkills(true);
  const { customAgents, isLoading: isCustomAgentsLoading } =
    useCustomAgents(true);

  const queuedUserInputs = pendingInput.userInputs;
  const pendingNotifications = pendingInput.notifications;

  const [todoModeSelected, setTodoModeSelected] = useState(false);
  // Disable todo mode (rather than hide it) while active todos exist so it stays discoverable.
  const showTodoMode = !isSubTask;
  const todoModeDisabled = hasActiveTodos(todos);
  const canSelectTodoMode = showTodoMode && !todoModeDisabled;

  useEffect(() => {
    if (!canSelectTodoMode && todoModeSelected) {
      setTodoModeSelected(false);
    }
  }, [canSelectTodoMode, todoModeSelected]);

  const resetTodoMode = useCallback(() => {
    setTodoModeSelected(false);
  }, []);

  const {
    groupedModels,
    selectedModel,
    selectedModelFromStore, // for fallback display
    isLoading: isModelsLoading,
    isFetching: isFetchingModels,
    reload: reloadModels,
    updateSelectedModelId,
  } = useSelectedModels({ isSubTask, modelOverride });

  const { autoApproveActive } = useAutoApprove({ isSubTask });

  // Use the unified attachment upload hook
  const {
    files,
    isUploading: isUploadingAttachments,
    fileInputRef,
    removeFile,
    restoreFiles,
    handleFileSelect,
    handlePaste: handlePasteAttachment,
    handleFileDrop,
  } = attachmentUpload;

  const reviews = useReviews();
  const {
    selections: terminalContextSelections,
    removeSelection: removeTerminalContextSelection,
    clearSelections: clearTerminalContextSelections,
  } = useTerminalContextState();

  const { inlineCompactTask, inlineCompactTaskPending } = useInlineCompactTask({
    sendMessage,
  });

  const { newCompactTask, newCompactTaskPending } = useNewCompactTask({
    task,
    compact,
  });

  const blockingOperations: BlockingOperation[] = [
    {
      id: "new-compact-task",
      isBusy: newCompactTaskPending,
      label: t("tokenUsage.compacting"),
    },
    {
      id: "repair-mermaid",
      isBusy: isRepairingMermaid,
      label: t("mermaid.fixError"),
    },
  ];

  const blockingState = useBlockingOperations(blockingOperations);

  const {
    isRunning,
    isSubmitEnabled,
    isStopEnabled,
    allowSendMessage,
    allowSteer,
  } = useChatStatus({
    isModelValid: !!selectedModel,
    isLoading,
    isInputEmpty:
      !input.text.trim() &&
      (input.pastedTexts?.length ?? 0) === 0 &&
      queuedUserInputs.length === 0,
    isFilesEmpty: files.length === 0,
    isReviewsEmpty: reviews.length === 0,
    isTerminalContextEmpty: terminalContextSelections.length === 0,
    isUploadingAttachments,
    blockingState,
    taskStatus: task?.status,
    pendingApproval,
    isSubTask,
  });

  const canSubmit =
    isSubmitEnabled && !isSkillsLoading && !isCustomAgentsLoading;
  const canSteer = allowSteer && !isSkillsLoading && !isCustomAgentsLoading;
  const compactEnabled = !(
    isRunning || totalTokens < constants.CompactTaskMinTokens
  );
  const AutoApproveIcon = autoApproveActive ? ShieldCheck : ShieldOff;

  const {
    isPreparingMessage,
    handleSubmit,
    handleSteerSubmit,
    handleSteer,
    sendPendingInput,
    handleStop,
  } = useChatSubmit({
    chat,
    input,
    clearInput,
    attachmentUpload,
    isLoading,
    isRunning,
    isSubmitEnabled: canSubmit,
    isStopEnabled,
    allowSendMessage,
    allowSteer: canSteer,
    pendingApproval,
    pendingInputController,
    reviews,
    skills,
    customAgents,
    terminalContextSelections,
    clearTerminalContextSelections,
    taskId,
    isTodoMode: todoModeSelected,
    onTodoModeSubmitted: resetTodoMode,
  });

  const chatInputFormRef = useRef<ChatInputFormHandle>(null);
  const handleCurrentInputSubmit = useCallback(async () => {
    chatInputFormRef.current?.addToSubmitHistory();
    await handleSubmit(undefined, chatInputFormRef.current?.getInputSnapshot());
  }, [handleSubmit]);

  // While the agent works, the chat kit attaches pending input to its next
  // request, e.g. the continuation after tool calls. Once it stops, send it.
  const taskStatus = task?.status;
  const isIdle =
    status === "ready" &&
    allowSendMessage &&
    !pendingApproval &&
    (taskStatus === undefined ||
      taskStatus === "pending-input" ||
      taskStatus === "completed");

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages and pendingInput wake this effect up when the conversation or the pending input changes while the agent is idle.
  useEffect(() => {
    if (!isIdle) return;
    // The chat kit owns delivery, including deferring notifications while a
    // follow-up question waits for its answer.
    sendPendingInput({ automatic: true });
  }, [isIdle, messages, pendingInput, sendPendingInput]);

  // Rendered in the order they reach the model: user input, then
  // notifications.
  const notificationEntry = useMemo<DraftMessage | undefined>(() => {
    if (!pendingNotifications.length) return undefined;

    return {
      parts: [...pendingNotifications],
      raw: {
        text: pendingNotifications
          .map((part) =>
            part.data.kind === "monitor"
              ? part.data.description
              : part.data.kind === "subagent"
                ? `Subagent ${part.data.status}: ${part.data.title || part.data.agentType || part.data.taskId}`
                : part.data.summary,
          )
          .join("\n"),
        nonRemovable: true,
      },
    };
  }, [pendingNotifications]);

  const displayedQueuedMessages = useMemo(() => {
    const messages = queuedUserInputs.map(toDraftMessage);
    return notificationEntry ? [...messages, notificationEntry] : messages;
  }, [notificationEntry, queuedUserInputs]);

  // Remove a message from queue
  const handleRemoveQueuedMessage = useCallback(
    (index: number) => {
      const queued = queuedUserInputs[index];
      if (!queued) return;
      pendingInputController.removeUserInput(queued.id);
    },
    [queuedUserInputs, pendingInputController],
  );

  // Put a queued message back into the composer, replacing its current content.
  const handleEditQueuedMessage = useCallback(
    (index: number) => {
      const queued = queuedUserInputs[index];
      if (isPreparingMessage || !queued) return;
      const message = toDraftMessage(queued);
      if (!message.draft) return;
      // It may have been delivered meanwhile; only edit what is still queued.
      if (!pendingInputController.removeUserInput(queued.id)) return;
      const { draft } = message;
      setInput(draft.input);
      restoreFiles(draft.attachments);
      setTodoModeSelected(canSelectTodoMode && !!message.raw.isTodoMode);
      // Focus after the editor applied the restored content.
      setTimeout(() => chatInputFormRef.current?.focusInput(), 0);
    },
    [
      queuedUserInputs,
      pendingInputController,
      setInput,
      restoreFiles,
      canSelectTodoMode,
      isPreparingMessage,
    ],
  );

  const allowAddToolResult = !blockingState.isBusy;
  useAddCompleteToolCalls({
    messages,
    enable: allowAddToolResult,
    addToolOutput,
    persistToolOutput,
    updateTodoCompletion,
  });

  const allowInteractiveToolAction = !(isLoading || blockingState.isBusy);
  const compactOptions = {
    enabled:
      compactEnabled && !inlineCompactTaskPending && !newCompactTaskPending,
    inlineCompactTask,
    inlineCompactTaskPending,
    newCompactTask,
    newCompactTaskPending,
  };

  const messageContent = useMemo(
    () => JSON.stringify(messages, null, 2),
    [messages],
  );

  const showRenderWidgetFixButton =
    !!shouldShowRenderWidgetFixButton &&
    allowInteractiveToolAction &&
    !pendingApproval;

  const showSubmitReviewButton =
    canSubmit &&
    !!reviews.length &&
    !!messages.length &&
    !isLoading &&
    !showRenderWidgetFixButton &&
    (!pendingApproval ||
      (pendingApproval.name === "retry" &&
        !isRetryApprovalCountingDown(pendingApproval)));

  // If there are pending reviews, we prioritize submitting them over completing the subtask.
  const showCompleteSubtaskButton =
    useShowCompleteSubtaskButton(subtask, messages) && !showSubmitReviewButton;
  const visibleTodos = isSubTask ? [] : todos;
  const hasVisibleTodos = visibleTodos.length > 0;

  return (
    <BackgroundJobContextProvider messages={messages}>
      <div className={PopupContainerClassName}>
        <div className={PopupContentClassName}>
          <ErrorMessageView error={displayError} />
          <CompleteSubtaskButton
            showCompleteButton={showCompleteSubtaskButton}
            subtask={subtask}
          />
          <ApprovalButton
            pendingApproval={pendingApproval}
            retry={retry}
            allowAddToolResult={allowInteractiveToolAction}
            isSubTask={isSubTask}
            task={task}
            subtask={subtask}
            onToolCallApprovalVisible={onToolCallApprovalVisible}
            onToolsExecutionStarted={onToolsExecutionStarted}
            onToolsExecutionEnded={onToolsExecutionEnded}
            hasQueuedMessages={queuedUserInputs.length > 0}
            onContinueWithQueuedMessage={handleSteer}
          />
          {showRenderWidgetFixButton ? (
            <div className="flex select-none gap-3 [&>button]:flex-1 [&>button]:rounded-sm">
              <FixWidgetButton />
            </div>
          ) : null}
          <SubmitReviewsButton
            showSubmitReviewButton={showSubmitReviewButton}
            onSubmit={handleCurrentInputSubmit}
          />
        </div>
      </div>
      {hasVisibleTodos && (
        <div className="mt-1.5 rounded-sm rounded-b-none border border-border border-b-0">
          <TodoList
            todos={visibleTodos}
            editable
            onSaveTodos={updateTodos}
            todoPaused={todoPaused}
            onTodoPausedChange={onTodoPausedChange}
          >
            <TodoList.Header />
            <TodoList.Items viewportClassname="max-h-48" />
          </TodoList>
        </div>
      )}
      <div className="relative z-10">
        <ChatInputForm
          ref={chatInputFormRef}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onCtrlSubmit={handleSteerSubmit}
          isLoading={isRunning}
          onPaste={handlePasteAttachment}
          pendingApproval={pendingApproval}
          status={status}
          onFileDrop={handleFileDrop}
          messageContent={messageContent}
          isSubTask={isSubTask}
          currentTaskId={taskId}
          reviews={reviews}
          terminalContextSelections={terminalContextSelections}
          onRemoveTerminalContextSelection={removeTerminalContextSelection}
          queuedMessages={displayedQueuedMessages}
          onRemoveQueuedMessage={handleRemoveQueuedMessage}
          onSteerQueuedMessages={handleSteer}
          onEditQueuedMessage={handleEditQueuedMessage}
          allowEditQueuedMessage={!isPreparingMessage}
          allowSteer={allowSteer}
          onAttachFile={() => fileInputRef.current?.click()}
          onSelectTodoMode={
            showTodoMode ? () => setTodoModeSelected(true) : undefined
          }
          todoModeDisabled={todoModeDisabled}
          contextMenuSide="top"
          className={cn({
            "rounded-t-none": hasVisibleTodos,
          })}
        >
          {files.length > 0 && (
            <AttachmentPreviewList
              files={files}
              onRemove={removeFile}
              isUploading={isUploadingAttachments}
              className="contents"
            />
          )}
        </ChatInputForm>
      </div>

      {/* Hidden file input for image uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,application/pdf,video/*"
        multiple
        className="hidden"
      />

      <div className={FooterContainerClassName}>
        <div className={FooterLeftClassName}>
          <ModelSelect
            value={selectedModel || selectedModelFromStore}
            models={groupedModels}
            isLoading={isModelsLoading}
            isFetching={isFetchingModels}
            isValid={!!selectedModel}
            onChange={updateSelectedModelId}
            reloadModels={reloadModels}
          />
          {canSelectTodoMode && todoModeSelected && (
            <TodoModeBadge onRemove={() => setTodoModeSelected(false)} />
          )}
        </div>

        <div className={FooterRightClassName}>
          {!!selectedModel && (
            <TokenUsage
              taskId={taskId}
              totalTokens={totalTokens}
              inputTokens={latestAssistantMetadata?.inputTokens}
              cacheReadTokens={latestAssistantMetadata?.cacheReadTokens}
              className="mr-5"
              compact={compactOptions}
              selectedModel={selectedModel}
            />
          )}
          <DevModeButton
            messages={messages}
            todos={todos}
            getSystemPrompt={getSystemPrompt}
          />
          <BackgroundJobManagePanel taskId={taskId} />
          <AutoApproveMenu
            isSubTask={isSubTask}
            mcpConfigOverride={mcpConfigOverride}
            tooltip={t(
              autoApproveActive
                ? "settings.autoApprove.toolbarTooltipEnabled"
                : "settings.autoApprove.toolbarTooltipDisabled",
            )}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "button-focus h-6 w-6 p-0",
                  autoApproveActive && "text-foreground",
                )}
                aria-label={t("settings.autoApprove.approvals")}
              >
                <AutoApproveIcon className="size-4 shrink-0 transition-colors duration-200" />
              </Button>
            }
          />
          {!isSubTask && (
            <PublicShareButton
              task={task}
              disabled={isModelsLoading}
              modelId={selectedModel?.id}
              displayError={displayError?.message}
              onUpdateIsPublicShared={onUpdateIsPublicShared}
            />
          )}
          <SubmitStopButton
            isButtonEnabled={canSubmit || isStopEnabled}
            showStopButton={isRunning}
            onSubmit={handleCurrentInputSubmit}
            onStop={handleStop}
          />
        </div>
      </div>
    </BackgroundJobContextProvider>
  );
};

interface SubmitStopButtonProps {
  isButtonEnabled: boolean;
  showStopButton: boolean;
  onSubmit: () => void;
  onStop: () => void;
}

const SubmitStopButton: React.FC<SubmitStopButtonProps> = ({
  isButtonEnabled,
  showStopButton,
  onSubmit,
  onStop,
}) => {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={!isButtonEnabled}
      className="button-focus h-6 w-6 p-0"
      onClick={() => {
        if (showStopButton) {
          onStop();
        } else {
          onSubmit();
        }
      }}
    >
      {showStopButton ? (
        <StopCircleIcon className="size-4" />
      ) : (
        <SendHorizonal className="size-4" />
      )}
    </Button>
  );
};

export function ChatToolBarSkeleton() {
  const { input, setInput } = useChatInputState();
  return (
    <>
      <div className={PopupContainerClassName}>
        <div className={PopupContentClassName}>
          <ErrorMessageView error={undefined} />
          <CompleteSubtaskButton
            showCompleteButton={false}
            subtask={undefined}
          />
          <ApprovalButton
            pendingApproval={undefined}
            retry={() => {}}
            allowAddToolResult={false}
            isSubTask={false}
          />
          <SubmitReviewsButton
            showSubmitReviewButton={false}
            onSubmit={async () => {}}
          />
        </div>
      </div>

      <ChatInputForm
        input={input}
        setInput={setInput}
        onSubmit={async () => {}}
        onCtrlSubmit={async () => {}}
        isLoading={true}
        onPaste={() => {}}
        status="streaming"
        isSubTask={false}
        pendingApproval={undefined}
        reviews={[]}
      />

      <div className={FooterContainerClassName}>
        <div className={FooterLeftClassName}>
          <ModelSelect
            isLoading={true}
            value={undefined}
            onChange={() => {}}
            models={undefined}
          />
        </div>
        <div className={FooterRightClassName}>
          <div className="py-[4px]">
            <Skeleton className="h-4 w-48 bg-[var(--vscode-inputOption-hoverBackground)]" />
          </div>
        </div>
      </div>
    </>
  );
}
