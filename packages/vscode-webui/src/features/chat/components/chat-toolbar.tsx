import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { DevModeButton } from "@/components/dev-mode-button";
import { DiffSummary } from "@/components/diff-summary";
import { ModelSelect } from "@/components/model-select";
import { PreviewTool } from "@/components/preview-tool";
import { PublicShareButton } from "@/components/public-share-button";
import { TokenUsage } from "@/components/token-usage";
import { Button } from "@/components/ui/button";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApprovalButton,
  isRetryApprovalCountingDown,
  type useApprovalAndRetry,
} from "@/features/approval";
import { useAutoApproveGuard } from "@/features/chat";
import { useSelectedModels } from "@/features/settings";
import { AutoApproveMenu } from "@/features/settings";
import { TodoList, useTodos } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useReviews } from "@/lib/hooks/use-reviews";
import { useTaskChangedFiles } from "@/lib/hooks/use-task-changed-files";
import { cn, tw } from "@/lib/utils";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants } from "@getpochi/common";
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";
import type { Message, Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { PaperclipIcon, SendHorizonal, StopCircleIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type BlockingOperation,
  useBlockingOperations,
} from "../hooks/use-blocking-operations";
import { useChatInputState } from "../hooks/use-chat-input-state";
import { useChatStatus } from "../hooks/use-chat-status";
import { useChatSubmit } from "../hooks/use-chat-submit";
import { useInlineCompactTask } from "../hooks/use-inline-compact-task";
import { useNewCompactTask } from "../hooks/use-new-compact-task";
import { useShowCompleteSubtaskButton } from "../hooks/use-subtask-completed";
import type { SubtaskInfo } from "../hooks/use-subtask-info";
import { ChatInputForm } from "./chat-input-form";
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
  displayError: Error | undefined;
  todosRef: React.RefObject<Todo[] | undefined>;
  onUpdateIsPublicShared?: (isPublicShared: boolean) => void;
  taskId: string;
  isRepairingMermaid?: boolean;
  mcpConfigOverride?: McpConfigOverride;
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
  todosRef,
  onUpdateIsPublicShared,
  taskId,
  isRepairingMermaid = false,
  mcpConfigOverride,
}) => {
  const { t } = useTranslation();

  const { messages, sendMessage, addToolResult, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const totalTokens = task?.totalTokens || 0;

  const { input, setInput, clearInput } = useChatInputState();

  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);

  // Initialize task with prompt if provided and task doesn't exist yet
  const { todos } = useTodos({
    initialTodos: task?.todos,
    messages,
    todosRef,
  });

  const {
    groupedModels,
    selectedModel,
    selectedModelFromStore, // for fallback display
    isLoading: isModelsLoading,
    isFetching: isFetchingModels,
    reload: reloadModels,
    updateSelectedModelId,
  } = useSelectedModels({ isSubTask });

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

  const {
    isExecuting,
    isBusyCore,
    isSubmitDisabled,
    showStopButton,
    showPreview,
  } = useChatStatus({
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

  const { handleSubmit, handleStop } = useChatSubmit({
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
  });

  const handleQueueMessage = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      e?.preventDefault();

      const message = input.text;
      if (message.trim()) {
        setQueuedMessages((prev) => [...prev, message]);
        clearInput();
      }
    },
    [input, clearInput],
  );

  useEffect(() => {
    const isReady =
      status === "ready" &&
      !isExecuting &&
      !isBusyCore &&
      !!selectedModel &&
      (!pendingApproval || pendingApproval.name === "retry");

    if (isReady && queuedMessages.length > 0) {
      handleSubmit();
    }
  }, [
    status,
    isExecuting,
    isBusyCore,
    selectedModel,
    queuedMessages.length,
    pendingApproval,
    handleSubmit,
  ]);

  // Only allow adding tool results when not loading
  const allowAddToolResult = !(isLoading || blockingState.isBusy);
  useAddCompleteToolCalls({
    messages,
    enable: allowAddToolResult,
    addToolResult: addToolResult,
  });

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

  const showSubmitReviewButton =
    !isSubmitDisabled &&
    !!reviews.length &&
    !!messages.length &&
    !isLoading &&
    (!pendingApproval ||
      (pendingApproval.name === "retry" &&
        !isRetryApprovalCountingDown(pendingApproval)));

  // If there are pending reviews, we prioritize submitting them over completing the subtask.
  const showCompleteSubtaskButton =
    useShowCompleteSubtaskButton(subtask, messages) && !showSubmitReviewButton;

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
            allowAddToolResult={allowAddToolResult}
            isSubTask={isSubTask}
            task={task}
            subtask={subtask}
          />
          <SubmitReviewsButton
            showSubmitReviewButton={showSubmitReviewButton}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
      {(todos.length > 0 ||
        useTaskChangedFilesHelpers.visibleChangedFiles.length > 0) && (
        <div className={cn("mt-1.5 rounded-sm border border-border")}>
          {todos.length > 0 && (
            <TodoList todos={todos}>
              <TodoList.Header />
              <TodoList.Items viewportClassname="max-h-48" />
            </TodoList>
          )}
          <DiffSummary
            {...useTaskChangedFilesHelpers}
            className={cn({
              "rounded-t-none border-border border-t": todos.length > 0,
            })}
          />
        </div>
      )}
      <AutoApproveMenu
        isSubTask={isSubTask}
        mcpConfigOverride={mcpConfigOverride}
      />
      {files.length > 0 && (
        <AttachmentPreviewList
          files={files}
          onRemove={removeFile}
          isUploading={isUploadingAttachments}
        />
      )}
      <ChatInputForm
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        onCtrlSubmit={handleQueueMessage}
        isLoading={isLoading || isExecuting}
        onPaste={handlePasteAttachment}
        pendingApproval={pendingApproval}
        status={status}
        onFileDrop={handleFileDrop}
        messageContent={messageContent}
        queuedMessages={queuedMessages}
        onRemoveQueuedMessage={(index) =>
          setQueuedMessages((prev) => prev.filter((_, i) => i !== index))
        }
        isSubTask={isSubTask}
        reviews={reviews}
        taskId={taskId}
        lastCheckpointHash={task?.lastCheckpointHash ?? undefined}
      />

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
        </div>

        <div className={FooterRightClassName}>
          {!!selectedModel && (
            <TokenUsage
              totalTokens={totalTokens}
              className="mr-5"
              compact={compactOptions}
              selectedModel={selectedModel}
            />
          )}
          <DevModeButton messages={messages} todos={todos} />
          {!isSubTask && (
            <PublicShareButton
              task={task}
              disabled={isModelsLoading}
              modelId={selectedModel?.id}
              displayError={displayError?.message}
              onUpdateIsPublicShared={onUpdateIsPublicShared}
            />
          )}
          <HoverCard>
            <HoverCardTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="button-focus relative h-6 w-6 p-0"
                >
                  <span className="size-4">
                    <PaperclipIcon className="size-4 translate-y-[1.5px] scale-105" />
                  </span>
                </Button>
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="start"
              sideOffset={6}
              className="!w-auto max-w-sm bg-background px-3 py-1.5 text-xs"
            >
              {t("chat.attachmentTooltip")}
            </HoverCardContent>
          </HoverCard>
          <SubmitStopButton
            isSubmitDisabled={isSubmitDisabled}
            showStopButton={showStopButton}
            onSubmit={handleSubmit}
            onStop={handleStop}
          />
        </div>
      </div>

      {showPreview && <PreviewTool messages={messages} />}
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

      <AutoApproveMenu isSubTask={false} />
      <ChatInputForm
        input={input}
        setInput={setInput}
        onSubmit={async () => {}}
        onCtrlSubmit={async () => {}}
        isLoading={true}
        onPaste={() => {}}
        onRemoveQueuedMessage={() => {}}
        status="streaming"
        queuedMessages={[]}
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
