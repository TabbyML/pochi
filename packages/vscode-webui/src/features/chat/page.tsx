import { ModelSelect } from "@/components/model-select";
import { Button } from "@/components/ui/button";
import { ChatContextProvider, useAutoApproveGuard } from "@/features/chat";
import { useEnableCheckpoint, useSelectedModels } from "@/features/settings";
import { apiClient, type authClient } from "@/lib/auth-client";
import { type UseChatHelpers, useChat } from "@ai-sdk/react";
import { formatters, prompts, toUIMessages } from "@ragdoll/common";
import type { Environment, ExtendedUIMessage, Todo } from "@ragdoll/db";
import type { InferResponseType } from "hono/client";
import {
  ExternalLinkIcon,
  ImageIcon,
  SendHorizonal,
  StopCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DevModeButton } from "@/components/dev-mode-button"; // Added import
import { ErrorMessage } from "@/components/error-message";
import { ImagePreviewList } from "@/components/image-preview-list";
import { PreviewTool } from "@/components/preview-tool";
import { PublicShareButton } from "@/components/public-share-button";
import { TokenUsage } from "@/components/token-usage";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { ApprovalButton, useApprovalAndRetry } from "@/features/approval";
import { AutoApproveMenu } from "@/features/settings";
import { LegacyTodoList, useTodos } from "@/features/todo";
import { useAddCompleteToolCalls } from "@/lib/hooks/use-add-complete-tool-calls";
import { useAutoResume } from "@/lib/hooks/use-auto-resume";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { useMcp } from "@/lib/hooks/use-mcp";
import { useMinionId } from "@/lib/hooks/use-minion-id";
import { vscodeHost } from "@/lib/vscode";

import { ServerErrors } from "@ragdoll/server";
import type { GitDiff } from "@ragdoll/vscode-webui-bridge";
import { ChatArea } from "./components/chat-area";
import { ChatInputForm } from "./components/chat-input-form";
import { useAutoDismissError } from "./hooks/use-auto-dismiss-error";
import { useChatStatus } from "./hooks/use-chat-status";
import { useChatSubmit } from "./hooks/use-chat-submit";
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
    models,
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

  const latestHttpCode = useRef<number | undefined>(undefined);
  const enableCheckpoint = useEnableCheckpoint();
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
        selectedModel?.id,
        enableCheckpoint,
        minionId,
      ),
    fetch: async (url, options) => {
      const resp = await fetch(url, options);
      // If the task is already streaming, resume the stream
      latestHttpCode.current = resp.status;
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

    let userEdits: GitDiff[] | undefined;
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
  }, [messages, autoApproveGuard.current]);

  const {
    todos,
    isEditMode,
    draftTodos,
    hasDirtyChanges,
    enterEditMode,
    exitEditMode,
    saveTodos: saveTodosImpl,
    updateTodoStatus,
  } = useTodos({
    initialTodos: task?.todos,
    messages,
    todosRef,
  });

  const isLoading = status === "streaming" || status === "submitted";

  const {
    isExecuting,
    isSubmitDisabled,
    showStopButton,
    showEditTodos,
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

  const { handleSubmit, handleStop } = useChatSubmit({
    chat,
    imageUpload,
    isSubmitDisabled,
    isLoading,
    uid: uidRef,
    pendingApproval,
  });

  const saveTodos = useCallback(() => {
    saveTodosImpl();
    handleSubmit(
      undefined,
      prompts.createSystemReminder(
        "User have updated the to-do list. Please review them and adjust the plan accordingly. NEVER WORK ON TASKS THAT HAS BEEN MARKED AS COMPLETED OR CANCELLED.",
      ),
    );
  }, [saveTodosImpl, handleSubmit]);

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
    (pendingApproval?.name === "retry" ? pendingApproval.error : undefined);

  // Only allow adding tool results when not loading
  const allowAddToolResult = !(isLoading || isTaskLoading || isEditMode);
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
              <LegacyTodoList
                className="mt-2"
                todos={todos}
                status={status}
                isEditMode={isEditMode}
                draftTodos={draftTodos}
                hasDirtyChanges={hasDirtyChanges}
                enterEditMode={enterEditMode}
                exitEditMode={exitEditMode}
                saveTodos={saveTodos}
                updateTodoStatus={updateTodoStatus}
                showEdit={showEditTodos}
              />
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
                  value={selectedModel?.id}
                  models={models}
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
                  />
                )}
                <DevModeButton
                  messages={messages}
                  buildEnvironment={buildEnvironment}
                  todos={todos}
                  uid={uid}
                  selectedModel={selectedModel?.id}
                />
                {uid && (
                  <PublicShareButton
                    isPublicShared={task?.isPublicShared === true}
                    disabled={isTaskLoading || isModelsLoading}
                    uid={uid}
                    onError={setAutoDismissError}
                    modelId={selectedModel?.id}
                    displayError={displayError?.message}
                  />
                )}
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

class TaskError extends Error {
  constructor(
    readonly name: string,
    message: string,
  ) {
    super(message);
  }
}

function useTaskError(status: UseChatHelpers["status"], task?: Task | null) {
  const init = useRef(false);
  const [taskError, setTaskError] = useState<TaskError>();
  useEffect(() => {
    if (init.current || !task) return;
    init.current = true;
    const { error } = task;
    if (error) {
      setTaskError(new TaskError(error.kind, error.message));
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

function ErrorMessageView({ error }: { error: TaskError | undefined }) {
  return (
    <ErrorMessage
      error={error}
      formatter={(e) => {
        if (e.message === ServerErrors.ReachedCreditLimit) {
          return (
            <span>
              You have reached the spending limit.{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                See more
              </a>
            </span>
          );
        }

        if (e.message === ServerErrors.ReachedOrgCreditLimit) {
          return (
            <span>
              Your team has reached the spending limit.{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                See more
              </a>
            </span>
          );
        }

        if (e.message === ServerErrors.RequireSubscription) {
          return (
            <span>
              You've used all your free credits. To continue, please subscribe
              to Pochi.{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                Subscribe
              </a>
            </span>
          );
        }

        if (e.message === ServerErrors.RequireOrgSubscription) {
          return (
            <span>
              Your team does not have a subscription yet. To continue, please
              subscribe to Pochi.{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                Subscribe
              </a>
            </span>
          );
        }

        return e.message;
      }}
    />
  );
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
