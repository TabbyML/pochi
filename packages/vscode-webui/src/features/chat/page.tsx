import { ModelSelect } from "@/components/model-select";
import { Button } from "@/components/ui/button";
import { ChatContextProvider, useAutoApproveGuard } from "@/features/chat";
import { useSelectedModels } from "@/features/settings";
import { apiClient, type authClient } from "@/lib/auth-client";
import { type UseChatHelpers, useChat } from "@ai-sdk/react";
import type { Todo } from "@getpochi/tools";
import {
  CompactTaskMinTokens,
  formatters,
  toUIMessages,
} from "@ragdoll/common";
import type { Environment, ExtendedUIMessage } from "@ragdoll/db";
import type { InferResponseType } from "hono/client";
import { ImageIcon, SendHorizonal, StopCircleIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DevModeButton } from "@/components/dev-mode-button"; // Added import
import { ImagePreviewList } from "@/components/image-preview-list";
import { PreviewTool } from "@/components/preview-tool";
import { PublicShareButton } from "@/components/public-share-button";
import { TokenUsage } from "@/components/token-usage";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { ApprovalButton, useApprovalAndRetry } from "@/features/approval";
import { AutoApproveMenu } from "@/features/settings";
import { TodoList, useTodos } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import { useAutoResume } from "@/lib/hooks/use-auto-resume";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { useMcp } from "@/lib/hooks/use-mcp";
import { useMinionId } from "@/lib/hooks/use-minion-id";
import { vscodeHost } from "@/lib/vscode";

import { usePochiModelSettings } from "@/lib/hooks/use-pochi-model-settings";
import { ChatArea } from "./components/chat-area";
import { ChatInputForm } from "./components/chat-input-form";
import { ErrorMessageView } from "./components/error-message-view";
import { useAutoDismissError } from "./hooks/use-auto-dismiss-error";
import { useChatStatus } from "./hooks/use-chat-status";
import { useChatSubmit } from "./hooks/use-chat-submit";
import { useCompactNewTask } from "./hooks/use-compact-new-task";
import { useForceCompactTask } from "./hooks/use-force-compact-task";
import { useNewTaskHandler } from "./hooks/use-new-task-handler";
import { usePendingModelAutoStart } from "./hooks/use-pending-model-auto-start";
import { useScrollToBottom } from "./hooks/use-scroll-to-bottom";
import { useTokenUsageUpdater } from "./hooks/use-token-usage-updater";
import { useHandleChatEvents } from "./lib/chat-events";
import { prepareRequestBody } from "./lib/prepare-request-body";

export function ChatPage({
  task,
  isTaskLoading,
  auth,
}: {
  task: Task | null;
  isTaskLoading: boolean;
  auth: typeof authClient.$Infer.Session;
}) {
  return (
    <ChatContextProvider>
      <Chat task={task} isTaskLoading={isTaskLoading} auth={auth} />
    </ChatContextProvider>
  );
}

type Task = NonNullable<
  InferResponseType<(typeof apiClient.api.tasks)[":uid"]["$get"]>
>;
interface ChatProps {
  task: Task | null;
  isTaskLoading: boolean;
  auth: typeof authClient.$Infer.Session;
}

function Chat({ auth, task, isTaskLoading }: ChatProps) {
  const autoApproveGuard = useAutoApproveGuard();
  const { data: minionId } = useMinionId();
  const { uid, uidRef, setUid } = useUid(task);
  const [totalTokens, setTotalTokens] = useState<number>(
    task?.totalTokens || 0,
  );
  useEffect(() => {
    if (task) {
      setTotalTokens(task.totalTokens || 0);
    }
  }, [task]);

  const { data: currentWorkspace, isFetching } = useCurrentWorkspace();
  const isWorkspaceActive = !!currentWorkspace;

  const {
    groupedModels,
    selectedModel,
    isLoading: isModelsLoading,
    updateSelectedModelId: handleSelectModel,
  } = useSelectedModels();
  const initialMessages = toUIMessages(task?.conversation?.messages || []);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { error: autoDismissError, setError: setAutoDismissError } =
    useAutoDismissError();

  // Use the unified image upload hook
  const imageUpload = useImageUpload();
  const {
    files,
    isUploading: isUploadingImages,
    error: uploadImageError,
    fileInputRef,
    removeFile: handleRemoveImage,
    handleFileSelect,
    handlePaste: handlePasteImage,
  } = imageUpload;

  const todosRef = useRef<Todo[] | undefined>(undefined);

  const { toolset: mcpToolSet } = useMcp();

  const openAIModelOverride =
    selectedModel?.type === "byok"
      ? {
          baseURL: selectedModel.provider.baseURL,
          apiKey: selectedModel.provider.apiKey,
          maxOutputTokens: selectedModel.maxTokens,
          contextWindow: selectedModel.contextWindow,
        }
      : undefined;

  const latestHttpCode = useRef<number | undefined>(undefined);
  const recentAborted = useRef<boolean>(false);
  const pochiModelSettings = usePochiModelSettings();
  const chat = useChat({
    /*
     * DO NOT SET throttle - it'll cause messages got re-written after the chat became ready state.
     */
    // experimental_throttle: 100,
    initialMessages,
    api: apiClient.api.chat.stream.$url().toString(),
    onFinish: (message, { finishReason }) => {
      autoApproveGuard.current = true;

      let numToolCalls: number | undefined;
      if (finishReason === "tool-calls") {
        // Find the last step-start index
        const lastStepStartIndex =
          message.parts?.reduce((lastIndex, part, index) => {
            return part.type === "step-start" ? index : lastIndex;
          }, -1) ?? -1;

        // Count tool invocations only from after the last step-start
        numToolCalls =
          message.parts
            ?.slice(lastStepStartIndex + 1)
            .filter((part) => part.type === "tool-invocation").length || 0;
      }

      vscodeHost.capture({
        event: "chatFinish",
        properties: {
          modelId: selectedModel?.id,
          finishReason,
          numToolCalls,
        },
      });
    },
    experimental_prepareRequestBody: async (req) =>
      prepareRequestBody(
        uidRef,
        req,
        await buildEnvironment(),
        mcpToolSet,
        selectedModel?.modelId,
        minionId,
        openAIModelOverride,
        pochiModelSettings?.modelEndpointId,
        req.messages.at(-1)?.role === "user" ? forceCompact.current : undefined,
      ),
    fetch: async (url, options) => {
      let resp: Response | null = null;
      let numAttempts = 0;
      do {
        if (numAttempts > 0) {
          await new Promise((res) => setTimeout(res, 1000 * 2 ** numAttempts));
        }
        numAttempts++;
        resp = await fetch(url, options);

        // A 409 conflict can occur if the user aborts a streaming request and immediately retries,
        // as the task status in the database might still be 'streaming'.
        // We use exponential backoff to handle this race condition.
      } while (resp.status === 409 && recentAborted.current && numAttempts < 5);

      latestHttpCode.current = resp.status;
      recentAborted.current = false;
      return resp;
    },
    headers: {
      Authorization: `Bearer ${auth.session.token}`,
    },
  });

  const {
    data,
    error,
    messages,
    setMessages,
    reload,
    setInput,
    append,
    input,
    status,
    addToolResult,
    experimental_resume,
  } = chat;

  const buildEnvironment = useCallback(async () => {
    const environment = await vscodeHost.readEnvironment();

    return {
      todos: todosRef.current,
      ...environment,
    } satisfies Environment;
  }, []);

  const { todos } = useTodos({
    initialTodos: task?.todos,
    messages,
    todosRef,
  });

  const isLoading = status === "streaming" || status === "submitted";

  const {
    isExecuting,
    isSubmitDisabled,
    showStopButton,

    showPreview,
    showApproval,
  } = useChatStatus({
    isTaskLoading,
    isModelsLoading,
    isLoading,
    isInputEmpty: !input.trim(),
    isFilesEmpty: files.length === 0,
    isUploadingImages,
  });

  useAutoResume({
    autoResume:
      !isTaskLoading &&
      task?.status === "streaming" &&
      initialMessages.length > 0 &&
      initialMessages.length === messages.length,
    initialMessages,
    experimental_resume,
    setMessages,
    data,
  });

  useNewTaskHandler({ data, setUid, enabled: !uidRef.current });

  useTokenUsageUpdater({
    data,
    setTotalTokens,
  });

  const renderMessages = useMemo(() => formatters.ui(messages), [messages]);

  const { pendingApproval, retry } = useApprovalAndRetry({
    error,
    messages,
    status,
    append,
    setMessages,
    reload,
    experimental_resume,
    latestHttpCode,
    showApproval,
  });

  usePendingModelAutoStart({
    enabled: status === "ready" && messages.length === 1 && !isTaskLoading,
    task: task,
    retry,
  });

  const forceCompact = useRef(false);

  const compactTaskEnabled = !(
    isLoading ||
    isExecuting ||
    isTaskLoading ||
    totalTokens < CompactTaskMinTokens
  );

  const { isCompactingTask, handleCompactTask } = useForceCompactTask({
    forceCompact,
    append,
    enabled: compactTaskEnabled,
    data,
    setMessages,
  });

  const {
    isCompactingNewTask,
    handleCompactNewTask,
    error: compactNewTaskError,
  } = useCompactNewTask({
    uid,
    enabled: compactTaskEnabled,
    messages,
  });

  const { handleSubmit, handleStop } = useChatSubmit({
    chat,
    imageUpload,
    isSubmitDisabled,
    isLoading,
    pendingApproval,
    recentAborted,
    isCompacting: isCompactingTask || isCompactingNewTask,
  });

  useScrollToBottom({
    messagesContainerRef,
    isLoading,
    pendingApprovalName: pendingApproval?.name,
  });

  // Display errors with priority: 1. autoDismissError, 2. uploadImageError, 3. error pending retry approval
  const taskError = useTaskError(status, task);
  const displayError =
    autoDismissError ||
    uploadImageError ||
    taskError ||
    (pendingApproval?.name === "retry" ? pendingApproval.error : undefined) ||
    compactNewTaskError;

  // Only allow adding tool results when not loading
  const allowAddToolResult = !(isLoading || isTaskLoading);
  useAddCompleteToolCalls({
    messages,
    addToolResult: allowAddToolResult ? addToolResult : undefined,
    setMessages: setMessages,
  });

  useHandleChatEvents(isLoading || isTaskLoading ? undefined : append);

  return (
    <div className="flex h-screen flex-col">
      {showPreview && <PreviewTool messages={renderMessages} />}
      <ChatArea
        messages={renderMessages}
        isTaskLoading={isTaskLoading}
        isLoading={isLoading}
        isCompactingNewTask={isCompactingNewTask}
        user={auth.user}
        messagesContainerRef={messagesContainerRef}
      />
      <div className="flex flex-col px-4">
        <ErrorMessageView error={displayError} />
        {!isWorkspaceActive ? (
          <WorkspaceRequiredPlaceholder
            isFetching={isFetching}
            className="mb-12"
          />
        ) : (
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
              <ImagePreviewList
                files={files}
                onRemove={handleRemoveImage}
                isUploading={isUploadingImages}
              />
            )}
            <ChatInputForm
              input={input}
              setInput={setInput}
              onSubmit={handleSubmit}
              isLoading={isLoading || isExecuting}
              onPaste={handlePasteImage}
              pendingApproval={pendingApproval}
              status={status}
            />

            {/* Hidden file input for image uploads */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              multiple
              className="hidden"
            />

            <div className="my-2 flex shrink-0 justify-between gap-5 overflow-x-hidden">
              <div className="flex items-center gap-2 overflow-x-hidden truncate">
                <ModelSelect
                  value={selectedModel}
                  models={groupedModels}
                  isLoading={isModelsLoading}
                  onChange={handleSelectModel}
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {!!selectedModel && (
                  <TokenUsage
                    contextWindow={selectedModel.contextWindow}
                    totalTokens={totalTokens}
                    className="mr-5"
                    compact={{
                      isCompactingTask,
                      handleCompactTask,
                      isCompactingNewTask,
                      handleCompactNewTask,
                      enabled: !(
                        !compactTaskEnabled ||
                        isCompactingTask ||
                        isCompactingNewTask
                      ),
                    }}
                  />
                )}
                <DevModeButton
                  messages={messages}
                  buildEnvironment={buildEnvironment}
                  todos={todos}
                  uid={uid}
                  selectedModel={selectedModel?.id}
                />
                <PublicShareButton
                  isPublicShared={task?.isPublicShared === true}
                  disabled={isTaskLoading || isModelsLoading}
                  uid={uid}
                  onError={setAutoDismissError}
                  modelId={selectedModel?.id}
                  displayError={displayError?.message}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-6 w-6 rounded-md p-0"
                >
                  <ImageIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isSubmitDisabled}
                  className="h-6 w-6 rounded-md p-0 transition-opacity"
                  onClick={() => {
                    if (showStopButton) {
                      autoApproveGuard.current = false;
                      handleStop();
                    } else {
                      handleSubmit();
                    }
                  }}
                >
                  {showStopButton ? (
                    <StopCircleIcon className="size-4" />
                  ) : (
                    <SendHorizonal className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function useTaskError(status: UseChatHelpers["status"], task?: Task | null) {
  const init = useRef(false);
  const [taskError, setTaskError] = useState<Error>();
  useEffect(() => {
    if (init.current || !task) return;
    init.current = true;
    const { error } = task;
    if (error) {
      const e = new Error(error.message);
      e.name = error.kind;
      setTaskError(e);
    }
  }, [task]);

  useEffect(() => {
    if (init.current && !taskError) return;
    if (status === "submitted" || status === "streaming") {
      setTaskError(undefined);
    }
  }, [status, taskError]);
  return taskError;
}

function useUid(task: Task | null) {
  const [uid, setUidImpl] = useState<string | undefined>(task?.uid);
  const uidRef = useRef<string | undefined>(task?.uid);

  const setUid = useCallback((newUid: string | undefined) => {
    uidRef.current = newUid;
    setUidImpl(newUid);
  }, []);

  useEffect(() => {
    if (task) {
      setUid(task.uid);
    }
  }, [task, setUid]);
  return {
    uid,
    uidRef,
    setUid,
  };
}

// @ts-ignore
function findLastCheckpointFromMessages(
  messages: ExtendedUIMessage[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    for (const part of message.parts) {
      if (part.type === "checkpoint" && part.checkpoint?.commit) {
        return part.checkpoint.commit;
      }
    }
  }
  return undefined;
}
