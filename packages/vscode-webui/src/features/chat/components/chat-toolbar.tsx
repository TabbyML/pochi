import { AttachmentPreviewList } from "@/components/attachment-preview-list";
import { DevModeButton } from "@/components/dev-mode-button";
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
import { ApprovalButton, type useApprovalAndRetry } from "@/features/approval";
import { useAutoApproveGuard } from "@/features/chat";
import { useSelectedModels } from "@/features/settings";
import { AutoApproveMenu } from "@/features/settings";
import { TodoList, useTodos } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import type { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { vscodeHost } from "@/lib/vscode";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants } from "@getpochi/common";
import type { Environment } from "@getpochi/common";
import type { UserEditsDiff } from "@getpochi/common/vscode-webui-bridge";
import type { Message, Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { PaperclipIcon, SendHorizonal, StopCircleIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStatus } from "../hooks/use-chat-status";
import { useChatSubmit } from "../hooks/use-chat-submit";
import { useInlineCompactTask } from "../hooks/use-inline-compact-task";
import { useNewCompactTask } from "../hooks/use-new-compact-task";
import { ChatInputForm } from "./chat-input-form";

interface ChatToolbarProps {
  task?: Task;
  approvalAndRetry: ReturnType<typeof useApprovalAndRetry>;
  compact: () => Promise<string>;
  chat: UseChatHelpers<Message>;
  attachmentUpload: ReturnType<typeof useAttachmentUpload>;
  isReadOnly: boolean;
  displayError: Error | undefined;
  todosRef: React.RefObject<Todo[] | undefined>;
}

export const ChatToolbar: React.FC<ChatToolbarProps> = ({
  chat,
  approvalAndRetry: { pendingApproval, retry },
  compact,
  attachmentUpload,
  isReadOnly,
  task,
  displayError,
  todosRef,
}) => {
  const { t } = useTranslation();
  const { messages, sendMessage, addToolResult, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const totalTokens = task?.totalTokens || 0;

  const [input, setInput] = useState("");
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
    isLoading: isModelsLoading,
    isValid: isModelValid,
    updateSelectedModel: handleSelectModel,
  } = useSelectedModels();

  const autoApproveGuard = useAutoApproveGuard();

  const buildEnvironment = useCallback(async () => {
    const environment = await vscodeHost.readEnvironment();

    let userEdits: UserEditsDiff[] | undefined;
    const lastCheckpointHash = findLastCheckpointFromMessages(messages);
    if (lastCheckpointHash && autoApproveGuard.current) {
      userEdits =
        (await vscodeHost.diffWithCheckpoint(lastCheckpointHash)) ?? undefined;
    }

    return {
      todos: todosRef.current,
      ...environment,
      userEdits,
    } satisfies Environment;
  }, [messages, autoApproveGuard.current, todosRef.current]);

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
    isReadOnly,
    isModelsLoading,
    isModelValid,
    isLoading,
    isInputEmpty: !input.trim() && queuedMessages.length === 0,
    isFilesEmpty: files.length === 0,
    isUploadingAttachments,
    newCompactTaskPending,
  });

  const compactEnabled = !(
    isLoading ||
    isReadOnly ||
    isExecuting ||
    totalTokens < constants.CompactTaskMinTokens
  );

  const { handleSubmit, handleStop, handleSubmitQueuedMessages } =
    useChatSubmit({
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

  useEffect(() => {
    const isReady =
      status === "ready" &&
      !isExecuting &&
      !isBusyCore &&
      (!pendingApproval || pendingApproval.name === "retry");

    if (isReady && queuedMessages.length > 0) {
      handleSubmitQueuedMessages();
    }
  }, [
    status,
    isExecuting,
    isBusyCore,
    queuedMessages.length,
    pendingApproval,
    handleSubmitQueuedMessages,
  ]);

  // Only allow adding tool results when not loading
  const allowAddToolResult = !(
    isLoading ||
    isReadOnly ||
    newCompactTaskPending
  );
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

  return (
    <>
      <ApprovalButton
        pendingApproval={pendingApproval}
        retry={retry}
        allowAddToolResult={allowAddToolResult}
      />
      {todos && todos.length > 0 && (
        <TodoList todos={todos} className="mt-2">
          <TodoList.Header />
          <TodoList.Items viewportClassname="max-h-48" />
        </TodoList>
      )}
      <AutoApproveMenu />
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
            value={selectedModel}
            models={groupedModels}
            isLoading={isModelsLoading}
            isValid={isModelValid}
            onChange={handleSelectModel}
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
          <DevModeButton
            messages={messages}
            buildEnvironment={buildEnvironment}
            todos={todos}
          />
          <PublicShareButton
            disabled={isReadOnly || isModelsLoading}
            shareId={task?.shareId}
            modelId={selectedModel?.id}
            displayError={displayError?.message}
          />
          <HoverCard>
            <HoverCardTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="button-focus h-6 w-6 p-0"
                >
                  <PaperclipIcon className="size-4" />
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
          autoApproveGuard.current = false;
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

function findLastCheckpointFromMessages(
  messages: Message[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    for (const part of message.parts) {
      if (part.type === "data-checkpoint" && part.data?.commit) {
        return part.data.commit;
      }
    }
  }
  return undefined;
}
