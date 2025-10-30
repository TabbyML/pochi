import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { DevModeButton } from "@/components/dev-mode-button";
import { ModelSelect } from "@/components/model-select";
import { PreviewTool } from "@/components/preview-tool";
import { PublicShareButton } from "@/components/public-share-button";
import { TokenUsage } from "@/components/token-usage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ApprovalButton, type useApprovalAndRetry } from "@/features/approval";
import { useAutoApproveGuard } from "@/features/chat";
import { useSelectedModels } from "@/features/settings";
import { AutoApproveMenu } from "@/features/settings";
import { TodoList, useTodos } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { vscodeHost } from "@/lib/vscode";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants } from "@getpochi/common";
import { getWorktreeName } from "@getpochi/common/git-utils";
import type { Message, Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import {
  GitBranch,
  GitCompare,
  Loader2,
  PaperclipIcon,
  SendHorizonal,
  StopCircleIcon,
  Terminal,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStatus } from "../hooks/use-chat-status";
import { useChatSubmit } from "../hooks/use-chat-submit";
import { useInlineCompactTask } from "../hooks/use-inline-compact-task";
import { useNewCompactTask } from "../hooks/use-new-compact-task";
import type { SubtaskInfo } from "../hooks/use-subtask-info";
import { ChatInputForm } from "./chat-input-form";
import { CompleteSubtaskButton } from "./subtask";

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
}) => {
  const { t } = useTranslation();

  const { messages, sendMessage, addToolResult, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const totalTokens = task?.totalTokens || 0;

  const [input, setInput] = useState("");
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [isDiffPending, setIsDiffPending] = useState(false);
  const [isDiffFailed, setIsDiffFailed] = useState(false);

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
    updateSelectedModelId,
  } = useSelectedModels({ isSubTask });

  const { data: currentWorkspace } = useCurrentWorkspace();

  const gitdir = task?.git?.worktree?.gitdir || currentWorkspace;
  const worktreeName = gitdir ? getWorktreeName(gitdir) : undefined;

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

  const { inlineCompactTask, inlineCompactTaskPending } = useInlineCompactTask({
    sendMessage,
  });

  const { newCompactTask, newCompactTaskPending } = useNewCompactTask({
    compact,
  });

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
    isInputEmpty: !input.trim() && queuedMessages.length === 0,
    isFilesEmpty: files.length === 0,
    isUploadingAttachments,
    newCompactTaskPending,
  });

  const compactEnabled = !(
    isLoading ||
    isExecuting ||
    totalTokens < constants.CompactTaskMinTokens
  );

  const { handleSubmit, handleStop } = useChatSubmit({
    chat,
    input,
    setInput,
    attachmentUpload,
    isSubmitDisabled,
    isLoading,
    pendingApproval,
    newCompactTaskPending,
    queuedMessages,
    setQueuedMessages,
  });

  const handleQueueMessage = (message: string) => {
    if (message.trim()) {
      setQueuedMessages((prev) => [...prev, message]);
      setInput("");
    }
  };

  const handleDiff = async () => {
    try {
      setIsDiffPending(true);
      setIsDiffFailed(false);
      const isDiffSuccess = await vscodeHost.diff();
      setIsDiffFailed(!isDiffSuccess);
    } catch {
      setIsDiffFailed(true);
    } finally {
      setIsDiffPending(false);
      setTimeout(() => {
        setIsDiffFailed(false);
      }, 2000);
    }
  };

  useEffect(() => {
    const isReady =
      status === "ready" &&
      !isExecuting &&
      !isBusyCore &&
      (!pendingApproval || pendingApproval.name === "retry");

    if (isReady && queuedMessages.length > 0) {
      handleSubmit();
    }
  }, [
    status,
    isExecuting,
    isBusyCore,
    queuedMessages.length,
    pendingApproval,
    handleSubmit,
  ]);

  // Only allow adding tool results when not loading
  const allowAddToolResult = !(isLoading || newCompactTaskPending);
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

  const isOpenInTab = globalThis.POCHI_WEBVIEW_KIND === "pane";
  const comparisonBranch = "origin/main";

  return (
    <>
      <CompleteSubtaskButton subtask={subtask} messages={messages} />
      <ApprovalButton
        pendingApproval={pendingApproval}
        retry={retry}
        allowAddToolResult={allowAddToolResult}
        isSubTask={isSubTask}
      />
      {todos && todos.length > 0 && (
        <TodoList todos={todos} className="mt-2">
          <TodoList.Header />
          <TodoList.Items viewportClassname="max-h-48" />
        </TodoList>
      )}
      <AutoApproveMenu isSubTask={isSubTask} />
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
        onQueueMessage={handleQueueMessage}
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

      <div className="my-2 flex shrink-0 justify-between gap-5 overflow-x-hidden">
        <div className="flex items-center gap-2 overflow-x-hidden truncate">
          <ModelSelect
            value={selectedModel || selectedModelFromStore}
            models={groupedModels}
            isLoading={isModelsLoading}
            isValid={!!selectedModel}
            onChange={updateSelectedModelId}
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!!selectedModel && (
            <TokenUsage
              totalTokens={totalTokens}
              className="mr-5"
              compact={compactOptions}
              selectedModel={selectedModel}
            />
          )}
          {isOpenInTab && !!worktreeName && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="button-focus h-6 w-6 p-0"
                >
                  <GitBranch className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="bg-background"
                side="top"
                align="end"
              >
                <DropdownMenuLabel className="flex items-center gap-2 text-muted-foreground text-xs">
                  <GitBranch className="size-4" />
                  <span>{worktreeName}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    vscodeHost.createTerminal(globalThis.POCHI_WEBVIEW_KIND);
                  }}
                >
                  <Terminal className="mr-2 size-4" />
                  <span>{t("chat.chatToolbar.openInTerminal")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDiff} disabled={isDiffPending}>
                  {isDiffPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <GitCompare className="mr-2 size-4" />
                  )}
                  <span>
                    {t("chat.chatToolbar.diffWorktreeWith", {
                      branch: comparisonBranch,
                    })}
                  </span>
                  {isDiffFailed && (
                    <span className="ml-auto pl-2 text-muted-foreground text-xs">
                      {t("checkpointUI.noChangesDetected")}
                    </span>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
