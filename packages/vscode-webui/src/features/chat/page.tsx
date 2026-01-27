import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatContextProvider, useHandleChatEvents } from "@/features/chat";
import { isRetryableError, usePendingModelAutoStart } from "@/features/retry";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useTaskMcpConfigOverride } from "@/lib/hooks/use-task-mcp-config-override";
import { prepareMessageParts } from "@/lib/message-utils";
import { blobStore } from "@/lib/remote-blob-store";
import { useManageBrowserSessions } from "@/lib/use-browser-sessions";
import { getOrLoadTaskStore, useDefaultStore } from "@/lib/use-default-store";
import { cn, tw } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { formatters } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { type Task, catalog } from "@getpochi/livekit";
import type { Message } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import type { StoreRegistry } from "@livestore/livestore";
import { useStoreRegistry } from "@livestore/react";
import { Schema } from "@livestore/utils/effect";
import { useRouter } from "@tanstack/react-router";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useApprovalAndRetry, useShouldStopAutoApprove } from "../approval";
import { getReadyForRetryError } from "../retry/hooks/use-ready-for-retry-error";
import {
  useAutoApprove,
  useSelectedModels,
  useSettingsStore,
} from "../settings";
import {
  getPendingToolcallApproval,
  isToolAutoApproved,
} from "../settings/hooks/use-tool-auto-approval";
import { ChatArea } from "./components/chat-area";
import { ChatToolBarSkeleton, ChatToolbar } from "./components/chat-toolbar";
import { SubtaskHeader } from "./components/subtask";
import { useKeepTaskEditor } from "./hooks/use-keep-task-editor";
import { useRepairMermaid } from "./hooks/use-repair-mermaid";
import { useRestoreTaskModel } from "./hooks/use-restore-task-model";
import { useScrollToBottom } from "./hooks/use-scroll-to-bottom";
import { useSetSubtaskModel } from "./hooks/use-set-subtask-model";
import { useAddSubtaskResult } from "./hooks/use-subtask-completed";
import { useSubtaskInfo } from "./hooks/use-subtask-info";
import {
  ChatContextProviderStub,
  useAutoApproveGuard,
  useChatAbortController,
  useRetryCount,
} from "./lib/chat-state";
import { onOverrideMessages } from "./lib/on-override-messages";
import { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";
import { useSendTaskNotification } from "./lib/use-send-task-notification";

const ChatContainerClassName = tw`mx-auto flex h-screen max-w-6xl flex-col`;
const ChatToolbarContainerClassName = tw`relative flex flex-col px-4`;

export function ChatPage(props: ChatProps) {
  return (
    <ChatContextProvider>
      <Chat {...props} />
    </ChatContextProvider>
  );
}

interface ChatProps {
  uid: string;
  user?: UserInfo;
  info: NonNullable<typeof window.POCHI_TASK_INFO>;
}

function Chat({ user, uid, info }: ChatProps) {
  const store = useDefaultStore();

  const { t } = useTranslation();
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const { initSubtaskAutoApproveSettings } = useSettingsStore();
  const defaultUser = {
    name: t("chatPage.defaultUserName"),
    image: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(store.clientId)}&scale=120`,
  };

  const chatAbortController = useChatAbortController();
  useAbortBeforeNavigation(chatAbortController.current);

  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  useKeepTaskEditor(task);
  const subtask = useSubtaskInfo(uid, task?.parentId);

  const isSubTask = !!subtask;

  // inherit autoApproveSettings from parent task
  useEffect(() => {
    if (isSubTask) {
      initSubtaskAutoApproveSettings();
    }
  }, [isSubTask, initSubtaskAutoApproveSettings]);

  const {
    isLoading: isModelsLoading,
    selectedModel,
    updateSelectedModelId,
  } = useSelectedModels({
    isSubTask,
  });
  const { customAgent } = useCustomAgent(subtask?.agent);
  const autoApproveGuard = useAutoApproveGuard();

  // Get mcpConfigOverride from TaskStateStore
  const {
    mcpConfigOverride,
    setMcpConfigOverride,
    isLoading: isMcpConfigLoading,
  } = useTaskMcpConfigOverride(uid);

  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask,
    mcpConfigOverride,
  });

  useRestoreTaskModel(task, isModelsLoading, updateSelectedModelId);

  const { sendNotification, clearNotification } = useSendTaskNotification();

  const { toolset } = useMcp();

  const { autoApproveActive, autoApproveSettings } = useAutoApprove({
    autoApproveGuard: autoApproveGuard.current === "auto",
    isSubTask,
  });

  const { retryCount } = useRetryCount();

  const manageBrowserSessions = useManageBrowserSessions();

  const onStreamStart = useLatest(
    (
      data: Pick<Task, "id" | "cwd"> & {
        messages: Message[];
      },
    ) => {
      const topTaskUid = isSubTask ? task?.parentId : uid;
      const cwd = data.cwd;
      if (!topTaskUid || !cwd) return;

      manageBrowserSessions({
        taskId: topTaskUid,
        messages,
      });

      clearNotification();
      vscodeHost.onTaskRunning(topTaskUid);
    },
  );

  const onStreamFinish = useLatest(
    (
      data: Pick<Task, "id" | "cwd" | "status"> & {
        messages: Message[];
        error?: Error;
      },
    ) => {
      const topTaskUid = isSubTask ? task?.parentId : uid;
      const cwd = data.cwd;
      if (!topTaskUid || !cwd) return;

      manageBrowserSessions({
        taskId: topTaskUid,
        messages,
      });

      if (data.status === "failed" && data.error) {
        let autoApprove = autoApproveGuard.current === "auto";
        if (data.error && !isRetryableError(data.error)) {
          autoApprove = false;
        }

        const retryLimit =
          autoApproveActive && autoApproveSettings.retry && autoApprove
            ? autoApproveSettings.maxRetryLimit
            : 0;

        if (
          retryLimit === 0 ||
          (retryCount?.count !== undefined && retryCount.count >= retryLimit)
        ) {
          sendNotification("failed", {
            uid: topTaskUid,
            isSubTask,
          });
        }
        return;
      }

      const lastMessage = data.messages.at(-1);
      if (!lastMessage) return;

      if (data.status === "pending-tool") {
        const pendingToolCallApproval = getPendingToolcallApproval(lastMessage);
        if (pendingToolCallApproval) {
          const autoApproved = isToolAutoApproved({
            autoApproveActive,
            autoApproveSettings,
            toolset,
            pendingApproval: pendingToolCallApproval,
          });

          if (!autoApproved) {
            sendNotification("pending-tool", {
              uid: topTaskUid,
              isSubTask,
            });
          }
        }
      }

      if (data.status === "pending-input") {
        const readyForRetryError = getReadyForRetryError(messages);
        if (!readyForRetryError) return;

        const retryLimit =
          autoApproveActive && autoApproveSettings.retry
            ? autoApproveSettings.maxRetryLimit
            : 0;

        if (
          retryLimit === 0 ||
          (retryCount?.count !== undefined && retryCount.count >= retryLimit)
        ) {
          sendNotification("pending-input", {
            uid: topTaskUid,
            isSubTask,
          });
        }
      }

      if (data.status === "completed") {
        sendNotification("completed", {
          uid: topTaskUid,
          isSubTask,
        });
      }
    },
  );

  const shouldStopAutoApprove = useShouldStopAutoApprove();

  const chatKit = useLiveChatKit({
    store,
    blobStore,
    taskId: uid,

    getters,
    isSubTask,
    customAgent,
    abortSignal: chatAbortController.current.signal,
    sendAutomaticallyWhen: (x) => {
      if (chatAbortController.current.signal.aborted) {
        return false;
      }

      if (shouldStopAutoApprove(x)) {
        autoApproveGuard.current = "stop";
      }

      if (autoApproveGuard.current === "stop") {
        return false;
      }

      // AI SDK v5 will retry regardless of the status if sendAutomaticallyWhen is set.
      if (chatKit.chat.status === "error") {
        return false;
      }
      return lastAssistantMessageIsCompleteWithToolCalls(x);
    },
    onOverrideMessages,
    onStreamStart(data) {
      onStreamStart.current(data);
    },
    onStreamFinish(data) {
      onStreamFinish.current(data);
    },
  });

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Use the unified image upload hook
  const attachmentUpload = useAttachmentUpload();

  const chat = useChat({
    chat: chatKit.chat,
  });

  const { messages, sendMessage, status } = chat;
  const renderMessages = useMemo(() => formatters.ui(messages), [messages]);
  const isLoading = status === "streaming" || status === "submitted";
  const isTaskWithoutContent =
    (info.type === "new-task" && !info.prompt && !info.files?.length) ||
    (info.type === "open-task" && messages.length === 0);

  const approvalAndRetry = useApprovalAndRetry({
    ...chat,
    showApproval: !isLoading && !isModelsLoading && !!selectedModel,
    isSubTask,
  });

  const { pendingApproval, retry } = approvalAndRetry;

  const { repairMermaid, repairingChart } = useRepairMermaid({
    repairMermaid: chatKit.repairMermaid,
  });

  useEffect(() => {
    const pendingToolApproval =
      pendingApproval && pendingApproval.name !== "retry"
        ? pendingApproval
        : null;
    const pendingToolCalls = pendingToolApproval
      ? "tool" in pendingToolApproval
        ? [pendingToolApproval.tool]
        : pendingToolApproval.tools
      : null;

    if (task) {
      vscodeHost.onTaskUpdated(
        Schema.encodeSync(catalog.tables.tasks.rowSchema)({
          ...task,
          runAsync: task.runAsync ?? false,
          pendingToolCalls,
        }),
      );
    }
  }, [pendingApproval, task]);

  useEffect(() => {
    if (chatKit.inited || isMcpConfigLoading) return;
    const cwd = info.cwd;
    if (info.type === "new-task") {
      if (info.mcpConfigOverride && setMcpConfigOverride) {
        setMcpConfigOverride(info.mcpConfigOverride);
      }

      const activeSelection = info.activeSelection;
      const files = info.files?.map((file) => ({
        type: "file" as const,
        filename: file.name,
        mediaType: file.contentType,
        url: file.url,
      }));
      const shouldUseParts = (files?.length ?? 0) > 0 || !!activeSelection;

      if (shouldUseParts) {
        chatKit.init(cwd, {
          prompt: info.prompt,
          parts: prepareMessageParts(
            t,
            info.prompt || "",
            files || [],
            [],
            undefined,
            activeSelection,
          ),
        });
      } else {
        chatKit.init(cwd, {
          prompt: info.prompt ?? undefined,
        });
      }
    } else if (info.type === "compact-task") {
      chatKit.init(cwd, {
        messages: JSON.parse(info.messages),
      });
    } else if (info.type === "fork-task") {
      // Persist mcpConfigOverride to TaskStateStore for forked tasks
      if (info.mcpConfigOverride && setMcpConfigOverride) {
        setMcpConfigOverride(info.mcpConfigOverride);
      }
    } else if (info.type === "open-task") {
      // Do nothing - mcpConfigOverride is loaded from TaskStateStore
    } else {
      assertUnreachable(info);
    }
  }, [chatKit, t, info, setMcpConfigOverride, isMcpConfigLoading]);

  useSetSubtaskModel({ isSubTask, customAgent });

  usePendingModelAutoStart({
    enabled:
      status === "ready" &&
      messages.length === 1 &&
      !isModelsLoading &&
      !!selectedModel &&
      info.type !== "fork-task",
    task,
    retry,
  });

  useAddSubtaskResult({ ...chat });

  useScrollToBottom({
    messagesContainerRef,
    isLoading,
    pendingApprovalName: pendingApproval?.name,
  });
  // Display errors with priority: 1. autoDismissError, 2. uploadImageError, 3. error pending retry approval
  const displayError = isLoading
    ? undefined
    : attachmentUpload.error ||
      fromTaskError(task) ||
      (pendingApproval?.name === "retry" ? pendingApproval.error : undefined);

  useHandleChatEvents({
    sendMessage:
      isLoading || isModelsLoading || !selectedModel ? undefined : sendMessage,
  });

  const { jwt } = usePochiCredentials();
  const storeRegistry = useStoreRegistry();

  const forkTask = useCallback(
    async (commitId: string, messageId?: string) => {
      if (task?.cwd) {
        await forkTaskFromCheckPoint(
          chatKit.fork,
          storeRegistry,
          jwt,
          task.title
            ? t("forkTask.forkedTaskTitle", { taskTitle: task.title })
            : undefined,
          task.cwd,
          commitId,
          messageId,
        );
      }
    },
    [chatKit.fork, storeRegistry, task, jwt, t],
  );

  return (
    <div className={ChatContainerClassName}>
      {subtask && (
        <SubtaskHeader
          subtask={subtask}
          className="absolute top-1 right-2 z-10"
        />
      )}
      <ChatArea
        messages={renderMessages}
        isLoading={isLoading}
        user={user || defaultUser}
        messagesContainerRef={messagesContainerRef}
        className={cn({
          // Leave more space for errors as errors / approval button are absolutely positioned
          "pb-14": !!displayError,
        })}
        hideEmptyPlaceholder={!isTaskWithoutContent}
        forkTask={task?.cwd ? forkTask : undefined}
        hideCheckPoint={isSubTask}
        repairMermaid={repairMermaid}
        repairingChart={repairingChart}
      />
      <div className={ChatToolbarContainerClassName}>
        <ChatToolbar
          chat={chat}
          task={task}
          todosRef={todosRef}
          compact={chatKit.compact}
          approvalAndRetry={approvalAndRetry}
          attachmentUpload={attachmentUpload}
          isSubTask={isSubTask}
          subtask={subtask}
          displayError={displayError}
          onUpdateIsPublicShared={chatKit.updateIsPublicShared}
          taskId={uid}
          isRepairingMermaid={!!repairingChart}
          mcpConfigOverride={mcpConfigOverride}
        />
      </div>
    </div>
  );
}

export function ChatSkeleton() {
  const skeletonClass = "bg-[var(--vscode-inputOption-hoverBackground)]";
  return (
    <ChatContextProviderStub>
      <div className={ChatContainerClassName}>
        <div className="mb-2 flex flex-1 flex-col gap-6 px-4 pt-8">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 pb-2">
              <Skeleton className={cn("size-7 rounded-full", skeletonClass)} />
              <Skeleton className={cn("h-4 w-12", skeletonClass)} />
            </div>
            <div className="ml-1 flex flex-col gap-2">
              <Skeleton className={cn("h-4 w-3/4", skeletonClass)} />
              <Skeleton className={cn("h-4 w-1/2", skeletonClass)} />
            </div>
          </div>
          <Separator className="mt-1 mb-2" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 pb-2">
              <Skeleton className={cn("size-7 rounded-full", skeletonClass)} />
              <Skeleton className={cn("h-4 w-12", skeletonClass)} />
            </div>
            <div className="ml-1 flex flex-col gap-2">
              <Skeleton className={cn("h-4 w-full", skeletonClass)} />
              <Skeleton className={cn("h-4 w-[90%]", skeletonClass)} />
              <Skeleton className={cn("h-4 w-[80%]", skeletonClass)} />
            </div>
          </div>
        </div>
        <div className={ChatToolbarContainerClassName}>
          <ChatToolBarSkeleton />
        </div>
      </div>
    </ChatContextProviderStub>
  );
}

function useAbortBeforeNavigation(abortController: AbortController) {
  const router = useRouter();
  useEffect(() => {
    // Subscribe to the 'onBeforeLoad' event
    const unsubscribe = router.subscribe("onBeforeLoad", () => {
      abortController.abort();
    });

    // Clean up the subscription when the component unmounts
    return () => {
      unsubscribe();
    };
  }, [abortController, router]);
}

function fromTaskError(task?: Task) {
  if (task?.error) {
    return new Error(task.error.message);
  }
}

async function forkTaskFromCheckPoint(
  fork: ReturnType<typeof useLiveChatKit>["fork"],
  storeRegistry: StoreRegistry,
  jwt: string | null,
  title: string | undefined,
  cwd: string,
  commitId: string,
  messageId?: string,
) {
  const newTaskId = crypto.randomUUID();
  const storeId = encodeStoreId(jwt, newTaskId);

  // Create store
  const targetStore = await getOrLoadTaskStore({
    storeRegistry,
    storeId,
    jwt,
  });

  // Copy data to new store
  fork(targetStore, {
    taskId: newTaskId,
    title,
    commitId,
    messageId,
  });

  // Restore checkpoint
  await vscodeHost.restoreCheckpoint(commitId);
  // Create new task
  await vscodeHost.openTaskInPanel({
    type: "fork-task",
    cwd,
    uid: newTaskId,
    storeId,
  });
}

function assertUnreachable(x: never): never {
  throw new Error(`Didn't expect to get here: ${JSON.stringify(x)}`);
}
