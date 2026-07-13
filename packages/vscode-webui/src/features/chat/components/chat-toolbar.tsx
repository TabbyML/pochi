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
import { useAutoApproveGuard, useToolCallLifeCycle } from "@/features/chat";
import {
  AutoApproveMenu,
  useAutoApprove,
  useIsDevMode,
  useSelectedModels,
} from "@/features/settings";
import { type TodoCompletionUpdate, TodoList } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useReviews } from "@/lib/hooks/use-reviews";
import { useTaskChangedFiles } from "@/lib/hooks/use-task-changed-files";
import { cn, tw } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants } from "@getpochi/common";
import { hasActiveTodos } from "@getpochi/common/message-utils";
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";
import type { Message, Task } from "@getpochi/livekit";
import { type Todo, initTodoModeTodos } from "@getpochi/tools";
import {
  SendHorizonal,
  ShieldCheck,
  ShieldOff,
  StopCircleIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type BlockingOperation,
  useBlockingOperations,
} from "../hooks/use-blocking-operations";
import { useChatInputState } from "../hooks/use-chat-input-state";
import { useChatStatus } from "../hooks/use-chat-status";
import { type QueuedMessage, useChatSubmit } from "../hooks/use-chat-submit";
import { useInlineCompactTask } from "../hooks/use-inline-compact-task";
import { useNewCompactTask } from "../hooks/use-new-compact-task";
import { useShowCompleteSubtaskButton } from "../hooks/use-subtask-completed";
import type { SubtaskInfo } from "../hooks/use-subtask-info";
import { ChatInputForm } from "./chat-input-form";
import { ErrorMessageView } from "./error-message-view";
import { QueuedMessages } from "./queued-messages";
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
}

export const ChatToolbar: React.FC<ChatToolbarProps> = ({
  chat,
  approvalAndRetry: { pendingApproval, retry },
  compact,
  attachmentUpload,
  isSubTask,
  subtask,
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
}) => {
  const { t } = useTranslation();

  const { messages, sendMessage, addToolOutput, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const totalTokens = task?.totalTokens || 0;
  const { completeToolCalls } = useToolCallLifeCycle();

  const { input, setInput, clearInput } = useChatInputState();

  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);

  const [isDevMode] = useIsDevMode();
  const canUseTodoMode = isDevMode === true;
  const [todoModeSelected, setTodoModeSelected] = useState(false);
  // Show the todo mode entry in dev mode, but disable it (rather than hide it)
  // while the task already has active todos so it stays discoverable.
  const showTodoMode = canUseTodoMode && !isSubTask;
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
  } = useSelectedModels({ isSubTask });

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

  const { isExecuting, isBusyCore, isSubmitDisabled, showStopButton } =
    useChatStatus({
      isModelsLoading,
      isModelValid: !!selectedModel,
      isLoading,
      isInputEmpty: !input.text.trim() && queuedMessages.length === 0,
      isFilesEmpty: files.length === 0,
      isReviewsEmpty: reviews.length === 0,
      isUploadingAttachments,
      blockingState,
    });

  const compactEnabled = !(
    isLoading ||
    isExecuting ||
    totalTokens < constants.CompactTaskMinTokens
  );
  const AutoApproveIcon = autoApproveActive ? ShieldCheck : ShieldOff;

  const { handleSubmit, handleSteerSubmit, handleStop } = useChatSubmit({
    chat,
    input,
    clearInput,
    attachmentUpload,
    isSubmitDisabled,
    isLoading,
    pendingApproval,
    blockingState,
    queuedMessages,
    setQueuedMessages,
    reviews,
    taskId: taskId,
    isTodoMode: todoModeSelected,
    canCreateTodo: !todoModeDisabled,
    onTodoModeQueued: resetTodoMode,
    onBeforeSendText: createTodoBeforeSend,
  });

  const autoApproveGuard = useAutoApproveGuard();
  const handleSteerQueuedMessage = useCallback(
    (index: number) => {
      setQueuedMessages((prev) => {
        const message = prev[index];
        if (!message) return prev;
        return [message, ...prev.filter((_, i) => i !== index)];
      });
      autoApproveGuard.current = "stop";
      handleStop();
    },
    [autoApproveGuard, handleStop],
  );

  useEffect(() => {
    const isReady =
      status === "ready" &&
      !isExecuting &&
      !isBusyCore &&
      completeToolCalls.length === 0 &&
      !!selectedModel &&
      (!pendingApproval || pendingApproval.name === "retry");

    if (isReady && queuedMessages.length > 0) {
      handleSubmit(undefined, { flushQueuedMessages: true });
    }
  }, [
    status,
    isExecuting,
    isBusyCore,
    completeToolCalls.length,
    selectedModel,
    queuedMessages.length,
    pendingApproval,
    handleSubmit,
  ]);

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

  const messageContent = useMemo(
    () => JSON.stringify(messages, null, 2),
    [messages],
  );

  const useTaskChangedFilesHelpers = useTaskChangedFiles(
    task?.id as string,
    messages,
    isExecuting,
  );

  const showRenderWidgetFixButton =
    !!shouldShowRenderWidgetFixButton &&
    allowInteractiveToolAction &&
    !pendingApproval;

  const showSubmitReviewButton =
    !isSubmitDisabled &&
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
  const hasQueuedMessages = queuedMessages.length > 0;

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
          />
          {showRenderWidgetFixButton ? (
            <div className="flex select-none gap-3 [&>button]:flex-1 [&>button]:rounded-sm">
              <FixWidgetButton />
            </div>
          ) : null}
          <SubmitReviewsButton
            showSubmitReviewButton={showSubmitReviewButton}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
      {hasQueuedMessages && (
        <QueuedMessages
          messages={queuedMessages}
          onRemove={(index) =>
            setQueuedMessages((prev) => prev.filter((_, i) => i !== index))
          }
          onSteer={handleSteerQueuedMessage}
        />
      )}
      {hasVisibleContextPanel && (
        <div
          className={cn(
            "mt-1.5 rounded-sm rounded-b-none border border-border border-b-0",
            {
              "mt-0": hasQueuedMessages,
            },
          )}
        >
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
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onCtrlSubmit={handleSteerSubmit}
          isLoading={isLoading || isExecuting}
          onPaste={handlePasteAttachment}
          pendingApproval={pendingApproval}
          status={status}
          onFileDrop={handleFileDrop}
          messageContent={messageContent}
          isSubTask={isSubTask}
          reviews={reviews}
          taskId={taskId}
          lastCheckpointHash={task?.lastCheckpointHash ?? undefined}
          onAttachFile={() => fileInputRef.current?.click()}
          onSelectTodoMode={
            showTodoMode ? () => setTodoModeSelected(true) : undefined
          }
          todoModeDisabled={todoModeDisabled}
          contextMenuSide="top"
          className={cn({
            "rounded-t-none": hasVisibleContextPanel || hasQueuedMessages,
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
            isSubmitDisabled={isSubmitDisabled}
            showStopButton={showStopButton}
            onSubmit={handleSubmit}
            onStop={handleStop}
          />
        </div>
      </div>
    </>
  );
};

interface SubmitStopButtonProps {
  isSubmitDisabled: boolean;
  showStopButton: boolean;
  onSubmit: () => void;
  onStop: () => void;
}

const SubmitStopButton: React.FC<SubmitStopButtonProps> = ({
  isSubmitDisabled,
  showStopButton,
  onSubmit,
  onStop,
}) => {
  const autoApproveGuard = useAutoApproveGuard();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={isSubmitDisabled}
      className="button-focus h-6 w-6 p-0"
      onClick={() => {
        if (showStopButton) {
          autoApproveGuard.current = "stop";
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
