import { FilesProvider } from "@/components/files-provider";
import { ChatContextProvider, useHandleChatEvents } from "@/features/chat";
import { usePendingModelAutoStart } from "@/features/retry";
import { useTodos } from "@/features/todo";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useTaskContextWindowUsage } from "@/lib/hooks/use-task-context-window-usage";
import { useTaskMcpConfigOverride } from "@/lib/hooks/use-task-mcp-config-override";
import { blobStore } from "@/lib/remote-blob-store";
import { getInitialTodos } from "@/lib/todos-utils";
import { useManageBrowserSession } from "@/lib/use-browser-session";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { constants, formatters } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { hasActiveTodos } from "@getpochi/common/message-utils";
import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";
import { type Message, type Task, catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import { parseOutputSchema } from "@getpochi/tools";
import { useStoreRegistry } from "@livestore/react";
import { Schema } from "@livestore/utils/effect";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApprovalAndRetry, useRenderWidgetError } from "../approval";
import {
  useAutoApprove,
  useSelectedModels,
  useSettingsStore,
} from "../settings";
import { BackgroundTaskDebugPanel } from "./components/background-task-debug-panel";
import { ChatArea } from "./components/chat-area";
import { ChatSkeleton } from "./components/chat-skeleton";
import { ChatToolbar } from "./components/chat-toolbar";
import { SubtaskHeader } from "./components/subtask";
import { useAbortBeforeNavigation } from "./hooks/use-abort-before-navigation";
import { useAutoOpenPlanFile } from "./hooks/use-auto-open-plan-file";
import { useChatInitialization } from "./hooks/use-chat-initialization";
import { useChatMemory } from "./hooks/use-chat-memory";
import { useChatNotifications } from "./hooks/use-chat-notifications";
import { useForkTask } from "./hooks/use-fork-task";
import { useKeepTaskEditor } from "./hooks/use-keep-task-editor";
import { useRepairMermaid } from "./hooks/use-repair-mermaid";
import { useRestoreTaskModel } from "./hooks/use-restore-task-model";
import { useScrollToBottom } from "./hooks/use-scroll-to-bottom";
import { useSetSubtaskModel } from "./hooks/use-set-subtask-model";
import { useAddSubtaskResult } from "./hooks/use-subtask-completed";
import { useSubtaskInfo } from "./hooks/use-subtask-info";
import { useAutoApproveGuard, useChatAbortController } from "./lib/chat-state";
import { onOverrideMessages } from "./lib/on-override-messages";
import { getRenderWidgetErrorMessageKey } from "./lib/render-widget-error";
import {
  getTodoContinuationDecision,
  shouldResumeTodoController,
} from "./lib/todo-continuation";
import { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";
import {
  ChatContainerClassName,
  ChatToolbarContainerClassName,
} from "./styles";

export function ChatPage(props: ChatProps) {
  return (
    <ChatContextProvider>
      <FilesProvider>
        <Chat {...props} />
      </FilesProvider>
    </ChatContextProvider>
  );
}

interface ChatProps {
  uid: string;
  user?: UserInfo;
  info: PochiTaskInfo;
}

function Chat({ user, uid, info }: ChatProps) {
  const store = useDefaultStore();
  const storeRegistry = useStoreRegistry();
  const { jwt } = usePochiCredentials();

  const { t } = useTranslation();
  const [todoPaused, setTodoPaused] = useState(false);
  const todoPausedRef = useLatest(todoPaused);
  const todoModeActiveRef = useRef(false);
  const lastAutoContinueStateRef = useRef<string | undefined>(undefined);
  const { initSubtaskAutoApproveSettings } = useSettingsStore();
  const defaultUser = {
    name: t("chatPage.defaultUserName"),
    image: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(store.clientId)}&scale=120`,
  };

  const chatAbortController = useChatAbortController();
  useAbortBeforeNavigation(chatAbortController.current, uid);

  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  useKeepTaskEditor(task);
  const subtask = useSubtaskInfo(uid, task?.parentId);

  const isSubTask = !!task?.parentId;
  const messageRows = store.useQuery(catalog.queries.makeMessagesQuery(uid));

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
  const { customAgent, isLoading: isCustomAgentLoading } = useCustomAgent(
    subtask?.agent,
  );
  const attemptCompletionSchema = useMemo(() => {
    const resultSchema = customAgent?.isBuiltIn
      ? customAgent._internal?.resultSchema
      : undefined;
    return resultSchema ? parseOutputSchema(resultSchema) : undefined;
  }, [customAgent?.isBuiltIn, customAgent?._internal?.resultSchema]);
  const initialTodos = getInitialTodos({
    info,
    isSubTask,
    subtask,
    task,
    messageRows,
  });
  const { todos, todosRef, updateTodos, updateTodoCompletion } = useTodos({
    persistedTodos: isSubTask ? undefined : task?.todos,
    initialTodos,
    taskId: uid,
  });
  const autoApproveGuard = useAutoApproveGuard();

  // Get mcpConfigOverride from TaskStateStore
  const {
    mcpConfigOverride,
    setMcpConfigOverride,
    isLoading: isMcpConfigLoading,
  } = useTaskMcpConfigOverride(uid);

  const { setContextWindowUsage } = useTaskContextWindowUsage(uid);
  const getters = useLiveChatKitGetters({
    todos: todosRef,
    todoModeActive: todoModeActiveRef,
    isSubTask,
    omitCustomRules: isSubTask && customAgent?.omitAgentsMd === true,
    mcpConfigOverride,
    taskId: uid,
  });

  useRestoreTaskModel(task, info, isModelsLoading, updateSelectedModelId);

  const { autoApproveActive, autoApproveSettings } = useAutoApprove({
    autoApproveGuard: autoApproveGuard.current === "auto",
    isSubTask,
  });

  const {
    onStreamStart: onChartNotificationsStreamStart,
    onStreamFinish: onChartNotificationsStreamFinish,
  } = useChatNotifications({
    uid,
    task,
    isSubTask,
    autoApproveGuard,
    autoApproveActive,
    autoApproveSettings,
  });

  const { backgroundTask, taskMemory, projectMemory } = useChatMemory({
    taskId: uid,
    isSubTask,
  });

  const [isCompacting, setIsCompacting] = useState(false);
  const onCompactStart = useCallback(() => {
    setIsCompacting(true);
  }, []);
  const onCompactFinish = useCallback(
    async (success: boolean) => {
      try {
        if (success) {
          await vscodeHost.clearFileStateCache(uid);
        }
      } finally {
        setIsCompacting(false);
      }
    },
    [uid],
  );

  const chatKit = useLiveChatKit({
    store,
    blobStore,
    taskId: uid,
    getters,
    isSubTask,
    customAgent,
    attemptCompletionSchema,
    abortSignal: chatAbortController.current.signal,
    enableAutoCompact: !isSubTask,
    onCompactStart,
    onCompactFinish,
    getRecentFilesForCompact: () => vscodeHost.readRecentFilesForCompact(uid),
    backgroundTask,
    taskMemory,
    projectMemory,
    sendAutomaticallyWhen: (x) => {
      const candidateMessages = x.messages;
      const candidateLastMessageState = getLastMessageState(candidateMessages);
      const claimAutoContinue = (shouldContinue: boolean) => {
        if (
          !shouldContinue ||
          !candidateLastMessageState ||
          lastAutoContinueStateRef.current === candidateLastMessageState
        ) {
          return false;
        }

        lastAutoContinueStateRef.current = candidateLastMessageState;
        return true;
      };

      if (chatAbortController.current.signal.aborted) {
        return false;
      }

      // AI SDK v5 can ask for automatic continuation after the user has
      // already submitted a newer message. Only continue from the exact state
      // that is still the current tail of the stream.
      if (
        chatKit.chat.status !== "ready" ||
        !candidateLastMessageState ||
        getLastMessageState(chatKit.chat.messages) !== candidateLastMessageState
      ) {
        return false;
      }

      const shouldContinueTodo = getTodoContinuationDecision(candidateMessages);
      if (shouldContinueTodo !== undefined) {
        return claimAutoContinue(!todoPausedRef.current && shouldContinueTodo);
      }

      if (shouldStopAutoApprove({ messages: candidateMessages })) {
        autoApproveGuard.current = "stop";
      }

      if (autoApproveGuard.current === "stop") {
        return false;
      }

      return claimAutoContinue(
        lastAssistantMessageIsCompleteWithToolCalls({
          messages: candidateMessages,
        }),
      );
    },
    onOverrideMessages,
    onStreamStart(data) {
      onChartNotificationsStreamStart.current(data);
    },
    onStreamFinish(data) {
      onChartNotificationsStreamFinish.current(data);
      if (data.contextWindowUsage) {
        setContextWindowUsage.current(data.contextWindowUsage);
      }
    },
  });

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Use the unified image upload hook
  const attachmentUpload = useAttachmentUpload();

  const chat = useChat({
    chat: chatKit.chat,
    experimental_throttle: constants.StreamingUpdateThrottleMs,
  });

  const { messages, sendMessage, status } = chat;
  const isLoading = status === "streaming" || status === "submitted";
  const todoModeActive =
    !isSubTask && !todoPaused && hasActiveTodos(todosRef.current);
  const hidePendingTodoAttemptCompletion = isLoading && todoModeActive;
  todoModeActiveRef.current = todoModeActive;
  const renderMessages = useMemo(
    () => formatters.ui(messages, { hidePendingTodoAttemptCompletion }),
    [messages, hidePendingTodoAttemptCompletion],
  );
  const isTaskWithoutContent =
    (info.type === "new-task" && !info.prompt && !info.files?.length) ||
    (info.type === "open-task" && messages.length === 0);

  const approvalAndRetry = useApprovalAndRetry({
    ...chat,
    showApproval: !isLoading && !isModelsLoading && !!selectedModel,
    isSubTask,
    clearFileStateCache: () => vscodeHost.clearFileStateCache(uid),
  });

  const { pendingApproval, retry } = approvalAndRetry;
  const renderWidgetErrorKind = useRenderWidgetError({
    messages,
  });

  const handleTodoPausedChange = useCallback(
    (paused: boolean) => {
      setTodoPaused(paused);
      if (paused) return;

      // Toggling pause is local UI state, so the SDK will not re-run
      // sendAutomaticallyWhen by itself. If the last audit asked us to keep
      // working, resume by sending the next automatic continuation tick.
      if (
        shouldResumeTodoController({
          messages,
          status,
        })
      ) {
        void sendMessage(undefined);
      }
    },
    [messages, sendMessage, status],
  );

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
          pendingToolCalls,
        }),
      );
    }
  }, [pendingApproval, task]);

  const { isInitializing } = useChatInitialization({
    chatKit,
    info,
    storeRegistry,
    jwt,
    t,
    setMcpConfigOverride,
    isMcpConfigLoading,
  });

  useSetSubtaskModel({ isSubTask, customAgent });

  usePendingModelAutoStart({
    enabled:
      status === "ready" &&
      messages.length === 1 &&
      !isModelsLoading &&
      !!selectedModel &&
      info.type !== "fork-task" &&
      (!isSubTask || (!!subtask && !(subtask.agent && isCustomAgentLoading))),
    task,
    retry,
  });

  useAddSubtaskResult({ ...chat });

  useAutoOpenPlanFile({
    isSubTask,
    subtask,
  });

  useManageBrowserSession({
    messages,
  });

  const lastMessage = messages.at(-1);
  const lastUserMessageId =
    lastMessage?.role === "user" ? lastMessage.id : undefined;

  const { onToolCallApprovalVisible } = useScrollToBottom({
    messagesContainerRef,
    lastUserMessageId,
  });
  const showRenderWidgetFixButton =
    !isLoading && !pendingApproval && !!renderWidgetErrorKind;
  const pendingApprovalError =
    pendingApproval?.name === "retry" ? pendingApproval.error : undefined;
  const renderWidgetError =
    showRenderWidgetFixButton && renderWidgetErrorKind
      ? new Error(
          t(
            getRenderWidgetErrorMessageKey({
              kind: renderWidgetErrorKind,
            }),
          ),
        )
      : undefined;

  // Display errors with priority: 1. uploadImageError, 2. task error, 3. pending approval error, 4. widget error
  const displayError = isLoading
    ? undefined
    : attachmentUpload.error ||
      fromTaskError(task) ||
      pendingApprovalError ||
      renderWidgetError;
  useHandleChatEvents({
    sendMessage:
      isLoading || isModelsLoading || !selectedModel ? undefined : sendMessage,
  });

  const { forkTask } = useForkTask({
    task,
    store,
    jwt,
    t,
  });

  if (isInitializing) {
    return <ChatSkeleton />;
  }

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
        isLoading={isLoading || isCompacting}
        loadingLabel={isCompacting ? t("tokenUsage.compacting") : undefined}
        user={user || defaultUser}
        messagesContainerRef={messagesContainerRef}
        className={cn({
          // Leave more space for errors as errors / approval button are absolutely positioned
          "pb-14": !!displayError,
        })}
        hideEmptyPlaceholder={!isTaskWithoutContent}
        forkTask={task?.cwd ? forkTask : undefined}
        isSubTask={isSubTask}
        repairMermaid={repairMermaid}
        repairingChart={repairingChart}
        showLastStepDuration={task?.status === "completed"}
      />
      <div className={ChatToolbarContainerClassName}>
        <ChatToolbar
          chat={chat}
          task={task}
          todos={todos}
          updateTodos={updateTodos}
          updateTodoCompletion={updateTodoCompletion}
          todoPaused={todoPaused}
          onTodoPausedChange={handleTodoPausedChange}
          compact={chatKit.compact}
          approvalAndRetry={approvalAndRetry}
          attachmentUpload={attachmentUpload}
          isSubTask={isSubTask}
          subtask={subtask}
          displayError={displayError}
          showRenderWidgetFixButton={showRenderWidgetFixButton}
          onUpdateIsPublicShared={chatKit.updateIsPublicShared}
          taskId={uid}
          isRepairingMermaid={!!repairingChart}
          mcpConfigOverride={mcpConfigOverride}
          getSystemPrompt={() => chatKit.latestSystemPrompt}
          onToolCallApprovalVisible={onToolCallApprovalVisible}
          onToolsExecutionStarted={chatKit.markStartToolsExecution}
          onToolsExecutionEnded={chatKit.markEndToolsExecution}
        />
      </div>
      <BackgroundTaskDebugPanel />
    </div>
  );
}

function fromTaskError(task?: Task) {
  if (task?.error) {
    return new Error(task.error.message);
  }
}

function shouldStopAutoApprove({ messages }: { messages: Message[] }) {
  const lastToolPart = messages.at(-1)?.parts.at(-1);
  return (
    lastToolPart?.type === "tool-newTask" &&
    ["planner", "reviewer"].includes(lastToolPart?.input?.agentType || "") &&
    lastToolPart?.state === "output-available"
  );
}

function getLastMessageState(messages: Message[]) {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return undefined;
  }

  // Build a lightweight fingerprint instead of serializing the whole message,
  // whose tool outputs / text parts can be large. This still changes whenever a
  // part is added, a tool part transitions state, or streamed text grows, which
  // is all the auto-continue decision depends on.
  const partsFingerprint = lastMessage.parts
    .map((part) => {
      const state = "state" in part ? part.state : "";
      const size = "text" in part ? part.text.length : 0;
      return `${part.type}:${state}:${size}`;
    })
    .join("|");
  return `${lastMessage.id}@${partsFingerprint}`;
}
