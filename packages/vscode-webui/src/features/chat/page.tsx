import { ChatContextProvider, useHandleChatEvents } from "@/features/chat";
import { usePendingModelAutoStart } from "@/features/retry";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useTaskMcpConfigOverride } from "@/lib/hooks/use-task-mcp-config-override";
import { blobStore } from "@/lib/remote-blob-store";
import { useManageBrowserSession } from "@/lib/use-browser-session";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { formatters } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { type Task, catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import { useStoreRegistry } from "@livestore/react";
import { Schema } from "@livestore/utils/effect";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useApprovalAndRetry, useShouldStopAutoApprove } from "../approval";
import {
  useAutoApprove,
  useSelectedModels,
  useSettingsStore,
} from "../settings";
import { ChatArea } from "./components/chat-area";
import { ChatToolbar } from "./components/chat-toolbar";
import { SubtaskHeader } from "./components/subtask";
import { useAbortBeforeNavigation } from "./hooks/use-abort-before-navigation";
import { useAutoOpenPlanFile } from "./hooks/use-auto-open-plan-file";
import { useChatInitialization } from "./hooks/use-chat-initialization";
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
import { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";
import {
  ChatContainerClassName,
  ChatToolbarContainerClassName,
} from "./styles";

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

  const { autoApproveActive, autoApproveSettings } = useAutoApprove({
    autoApproveGuard: autoApproveGuard.current === "auto",
    isSubTask,
  });

  const shouldStopAutoApprove = useShouldStopAutoApprove();

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

  const {
    onStreamStart: onManageBrowserSessionStreamStart,
    onStreamFinish: onManageBrowserSessionStreamFinish,
  } = useManageBrowserSession({
    uid,
    task,
    isSubTask,
  });

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
      onChartNotificationsStreamStart.current(data);
      onManageBrowserSessionStreamStart.current(data);
    },
    onStreamFinish(data) {
      onChartNotificationsStreamFinish.current(data);
      onManageBrowserSessionStreamFinish.current(data);
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

  useChatInitialization({
    chatKit,
    info,
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
      info.type !== "fork-task",
    task,
    retry,
  });

  useAddSubtaskResult({ ...chat });

  useAutoOpenPlanFile({
    isSubTask,
    subtask,
  });

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

  const { forkTask } = useForkTask({
    task,
    chatKit,
    storeRegistry,
    jwt,
    t,
  });

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
        isSubTask={isSubTask}
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

function fromTaskError(task?: Task) {
  if (task?.error) {
    return new Error(task.error.message);
  }
}
