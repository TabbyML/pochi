import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { DevModeButton } from "@/components/dev-mode-button";
import { DiffSummary } from "@/components/diff-summary";
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
import { useReviews } from "@/lib/hooks/use-reviews";
import { useSkills } from "@/lib/hooks/use-skills";
import { useTaskChangedFiles } from "@/lib/hooks/use-task-changed-files";
import { useUserEdits } from "@/lib/hooks/use-user-edits";
import { cn, tw } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants } from "@getpochi/common";
import type { MonitorEventEnvelope } from "@getpochi/common";
import { hasActiveTodos } from "@getpochi/common/message-utils";
import type {
  DisplayModel,
  McpConfigOverride,
} from "@getpochi/common/vscode-webui-bridge";
import type { Message, Task } from "@getpochi/livekit";
import { type Todo, initTodoModeTodos } from "@getpochi/tools";
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
import { type DraftMessage, useChatSubmit } from "../hooks/use-chat-submit";
import { useInlineCompactTask } from "../hooks/use-inline-compact-task";
import { useMonitorEvents } from "../hooks/use-monitor-events";
import { useNewCompactTask } from "../hooks/use-new-compact-task";
import { useShowCompleteSubtaskButton } from "../hooks/use-subtask-completed";
import type { SubtaskInfo } from "../hooks/use-subtask-info";
import { useTerminalContextState } from "../hooks/use-terminal-context-state";
import { collectAutoCompleteTokens } from "../lib/auto-complete-tokens";
import { ChatInputForm, type ChatInputFormHandle } from "./chat-input-form";
import { ErrorMessageView } from "./error-message-view";
import { SubmitReviewsButton } from "./submit-review-button";
import { CompleteSubtaskButton } from "./subtask";

const PopupContainerClassName = tw`-translate-y-full -top-2 absolute left-0 w-full px-4 pt-1`;
const PopupContentClassName = tw`flex w-full flex-col bg-background`;
const FooterContainerClassName = tw`my-2 flex shrink-0 justify-between gap-5 overflow-x-hidden`;
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
  onToolCallApprovalVisible,
  onToolsExecutionStarted,
  onToolsExecutionEnded,
}) => {
  const { t } = useTranslation();

  const { messages, sendMessage, addToolOutput, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const totalTokens = task?.totalTokens || 0;

  const { input, setInput, clearInput } = useChatInputState();
  const { skills, isLoading: isSkillsLoading } = useSkills(true);

  const [queuedMessages, setQueuedMessages] = useState<DraftMessage[]>([]);

  // Monitor events (startMonitor tool) enter the conversation through the
  // queued-messages pipeline: enqueue here, and the auto-dequeue effect
  // below delivers them as soon as the chat is idle. Events arriving while
  // a monitor draft is still queued are merged into it, so a burst becomes
  // one message (and one inference round) instead of many.
  const onMonitorEvents = useCallback((envelopes: MonitorEventEnvelope[]) => {
    setQueuedMessages((prev) => {
      const last = prev.at(-1);
      const queuedEnvelopes = last?.raw.monitor?.envelopes;
      const merged = queuedEnvelopes
        ? [...queuedEnvelopes, ...envelopes]
        : envelopes;

      const first = merged[0];
      const eventCount = merged.reduce((n, e) => n + e.lines.length, 0);
      const summary = [
        eventCount > 0 ? `${eventCount} event(s)` : "",
        merged.some((e) => e.ended) ? "ended" : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const draft: DraftMessage = {
        // Rendered to a system-reminder text for the LLM by the chat
        // transport; kept as a data part so the chat UI can display it.
        parts: [{ type: "data-monitor-events", data: { batches: merged } }],
        raw: {
          text: `Monitor [${first.description}]: ${summary}`,
          monitor: {
            backgroundJobId: first.backgroundJobId,
            description: first.description,
            envelopes: merged,
          },
        },
      };
      return queuedEnvelopes ? [...prev.slice(0, -1), draft] : [...prev, draft];
    });
  }, []);
  useMonitorEvents(taskId, onMonitorEvents);
  const [excludedUserEditsContext, setExcludedUserEditsContext] =
    useState<string>();
  const lastCheckpointHash = task?.lastCheckpointHash ?? undefined;
  const userEdits = useUserEdits(taskId);
  const userEditsContext = useMemo(() => {
    if (!lastCheckpointHash || userEdits.length === 0) return undefined;

    return JSON.stringify([
      taskId,
      lastCheckpointHash,
      userEdits.map(({ filepath, diff }) => [filepath, diff]),
    ]);
  }, [lastCheckpointHash, taskId, userEdits]);
  const includedUserEdits =
    userEditsContext !== undefined &&
    excludedUserEditsContext !== userEditsContext
      ? userEdits
      : [];

  useEffect(() => {
    if (
      excludedUserEditsContext &&
      excludedUserEditsContext !== userEditsContext
    ) {
      setExcludedUserEditsContext(undefined);
    }
  }, [excludedUserEditsContext, userEditsContext]);

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

  const createTodoBeforeSend = useCallback(
    (text: string) => {
      resetTodoMode();
      if (hasActiveTodos(todos)) return;

      updateTodos(initTodoModeTodos(text));
    },
    [resetTodoMode, todos, updateTodos],
  );

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
    isInputEmpty: !input.text.trim() && queuedMessages.length === 0,
    isFilesEmpty: files.length === 0,
    isReviewsEmpty: reviews.length === 0,
    isTerminalContextEmpty: terminalContextSelections.length === 0,
    isUploadingAttachments,
    blockingState,
    taskStatus: task?.status,
  });

  const canSubmit = isSubmitEnabled && !isSkillsLoading;
  const canSteer = allowSteer && !isSkillsLoading;
  const compactEnabled = !(
    isRunning || totalTokens < constants.CompactTaskMinTokens
  );
  const AutoApproveIcon = autoApproveActive ? ShieldCheck : ShieldOff;

  const {
    handleSubmit,
    handleSteerSubmit,
    handleSteerQueuedMessage,
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
    queuedMessages,
    setQueuedMessages,
    reviews,
    userEdits: includedUserEdits,
    skills,
    terminalContextSelections,
    clearTerminalContextSelections,
    taskId,
    isTodoMode: todoModeSelected,
    canCreateTodo: !todoModeDisabled,
    onTodoModeQueued: resetTodoMode,
    onBeforeSendText: createTodoBeforeSend,
  });

  const chatInputFormRef = useRef<ChatInputFormHandle>(null);
  const handleCurrentInputSubmit = useCallback(async () => {
    chatInputFormRef.current?.addToSubmitHistory();
    await handleSubmit(undefined, chatInputFormRef.current?.getInputSnapshot());
  }, [handleSubmit]);

  // Auto dequeue when ready
  const taskStatus = task?.status;
  useEffect(() => {
    const shouldAutoDequeue =
      status === "ready" &&
      allowSendMessage &&
      !pendingApproval &&
      (taskStatus === undefined ||
        taskStatus === "pending-input" ||
        taskStatus === "completed");

    if (shouldAutoDequeue && queuedMessages.length > 0) {
      handleSteerQueuedMessage(0);
    }
  }, [
    status,
    allowSendMessage,
    pendingApproval,
    taskStatus,
    queuedMessages,
    handleSteerQueuedMessage,
  ]);

  // Remove a message from queue
  const handleRemoveQueuedMessage = useCallback(
    (index: number) => {
      setQueuedMessages(queuedMessages.filter((_, i) => i !== index));
    },
    [queuedMessages],
  );

  const allowAddToolResult = !blockingState.isBusy;
  useAddCompleteToolCalls({
    messages,
    enable: allowAddToolResult,
    addToolOutput,
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

  // Only the word-like tokens are consumed by the prompt editor's
  // autocompletion, so collect those directly instead of retaining a serialized
  // copy of the whole conversation.
  const messageContent = useMemo(
    () => collectAutoCompleteTokens(messages),
    [messages],
  );

  const useTaskChangedFilesHelpers = useTaskChangedFiles(
    task?.id as string,
    messages,
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
  const hasVisibleChangedFiles =
    useTaskChangedFilesHelpers.visibleChangedFiles.length > 0;
  const hasVisibleContextPanel = hasVisibleTodos || hasVisibleChangedFiles;

  return (
    <>
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
            hasQueuedMessages={queuedMessages.length > 0}
            onContinueWithQueuedMessage={() => handleSteerQueuedMessage(0)}
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
      {hasVisibleContextPanel && (
        <div className="mt-1.5 rounded-sm rounded-b-none border border-border border-b-0">
          {hasVisibleTodos && (
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
          )}
          <DiffSummary
            {...useTaskChangedFilesHelpers}
            className={cn({
              "rounded-t-none border-border border-t": hasVisibleTodos,
            })}
          />
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
          reviews={reviews}
          userEdits={includedUserEdits}
          lastCheckpointHash={lastCheckpointHash}
          onRemoveUserEdits={() =>
            setExcludedUserEditsContext(userEditsContext)
          }
          terminalContextSelections={terminalContextSelections}
          onRemoveTerminalContextSelection={removeTerminalContextSelection}
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={handleRemoveQueuedMessage}
          onSteerQueuedMessage={handleSteerQueuedMessage}
          allowSteer={allowSteer}
          onAttachFile={() => fileInputRef.current?.click()}
          onSelectTodoMode={
            showTodoMode ? () => setTodoModeSelected(true) : undefined
          }
          todoModeDisabled={todoModeDisabled}
          contextMenuSide="top"
          className={cn({
            "rounded-t-none": hasVisibleContextPanel,
          })}
        >
          {files.length > 0 && (
            <div className="px-3">
              <AttachmentPreviewList
                files={files}
                onRemove={removeFile}
                isUploading={isUploadingAttachments}
              />
            </div>
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
    </>
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
