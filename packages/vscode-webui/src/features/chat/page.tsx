import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { ChatContextProvider, useHandleChatEvents } from "@/features/chat";
import { isRetryableError, usePendingModelAutoStart } from "@/features/retry";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { prepareMessageParts } from "@/lib/message-utils";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { formatters } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { type Task, catalog, taskCatalog } from "@getpochi/livekit";
import type { Message } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import { useStore } from "@livestore/react";
import { useRouter } from "@tanstack/react-router";
import {
  type FileUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { cn } from "@/lib/utils";
import { useApprovalAndRetry } from "../approval";
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
import { ChatToolbar } from "./components/chat-toolbar";
import { SubtaskHeader } from "./components/subtask";
import { useRestoreTaskModel } from "./hooks/use-restore-task-model";
import { useScrollToBottom } from "./hooks/use-scroll-to-bottom";
import { useSetSubtaskModel } from "./hooks/use-set-subtask-model";
import { useAddSubtaskResult } from "./hooks/use-subtask-completed";
import { useSubtaskInfo } from "./hooks/use-subtask-info";
import {
  useAutoApproveGuard,
  useChatAbortController,
  useRetryCount,
} from "./lib/chat-state";
import { onOverrideMessages } from "./lib/on-override-messages";
import { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";
import { useSendTaskNotification } from "./lib/use-send-task-notification";

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
  prompt?: string;
  files?: FileUIPart[];
}

function Chat({ user, uid, prompt, files }: ChatProps) {
  const { t } = useTranslation();
  const { store } = useStore();
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const { initSubtaskAutoApproveSettings } = useSettingsStore();
  const defaultUser = {
    name: t("chatPage.defaultUserName"),
    image: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(store.clientId)}&scale=120`,
  };

  const chatAbortController = useChatAbortController();
  useAbortBeforeNavigation(chatAbortController.current);

  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  const subtask = useSubtaskInfo(uid, task?.parentId);
  const isSubTask = !!subtask;

  const isNewTaskWithContent = !!prompt || !!files?.length;

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
  const { data: currentWorkspace, isFetching: isFetchingWorkspace } =
    useCurrentWorkspace();
  const isWorkspaceActive = !!currentWorkspace?.cwd;
  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask,
  });

  useRestoreTaskModel(task, isModelsLoading, updateSelectedModelId);

  const { sendNotification, clearNotification } = useSendTaskNotification();

  const { toolset } = useMcp();

  const { autoApproveActive, autoApproveSettings } = useAutoApprove({
    autoApproveGuard: autoApproveGuard.current === "auto",
    isSubTask,
  });

  const { retryCount } = useRetryCount();

  const onStreamFinish = useLatest(
    (
      data: Pick<Task, "id" | "cwd" | "status"> & {
        messages: Message[];
      },
    ) => {
      const lastMessage = data.messages.at(-1);
      const taskUid = isSubTask ? task?.parentId : uid;
      if (!taskUid || !lastMessage) return;

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
              uid: taskUid,
              cwd: data.cwd,
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
            uid: taskUid,
            cwd: data.cwd,
            isSubTask,
          });
        }
      }

      if (data.status === "completed") {
        sendNotification("completed", {
          uid: taskUid,
          cwd: data.cwd,
          isSubTask,
        });
      }
    },
  );

  const onStreamFailed = useLatest(
    ({ error, cwd }: { error: Error; cwd: string | null }) => {
      const taskUid = isSubTask ? task?.parentId : uid;
      if (!taskUid) return;

      let autoApprove = autoApproveGuard.current === "auto";
      if (error && !isRetryableError(error)) {
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
        sendNotification("failed", { uid: taskUid, cwd, isSubTask });
      }
    },
  );

  const chatKit = useLiveChatKit({
    taskId: uid,
    getters,
    isSubTask,
    customAgent,
    abortSignal: chatAbortController.current.signal,
    sendAutomaticallyWhen: (x) => {
      if (chatAbortController.current.signal.aborted) {
        return false;
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
    onStreamStart() {
      clearNotification();
    },
    onStreamFinish(data) {
      onStreamFinish.current(data);
    },
    onStreamFailed(data) {
      onStreamFailed.current(data);
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

  const approvalAndRetry = useApprovalAndRetry({
    ...chat,
    showApproval: !isLoading && !isModelsLoading && !!selectedModel,
    isSubTask,
  });

  const { pendingApproval, retry } = approvalAndRetry;

  useEffect(() => {
    const pendingToolApproval =
      pendingApproval && pendingApproval.name !== "retry"
        ? pendingApproval
        : null;
    const pendingToolCalls = pendingToolApproval
      ? "tool" in pendingToolApproval
        ? [pendingToolApproval.tool]
        : pendingToolApproval.tools
      : undefined;

    if (task) {
      vscodeHost.onTaskUpdated(
        taskCatalog.events.tastUpdated({
          ...task,
          title: task.title || undefined,
          parentId: task.parentId || undefined,
          cwd: task.cwd || undefined,
          modelId: task.modelId || undefined,
          error: task.error || undefined,
          git: task.git || undefined,
          shareId: task.shareId || undefined,
          totalTokens: task.totalTokens || undefined,
          pendingToolCalls,
        }),
      );
    }
  }, [pendingApproval, task]);

  useEffect(() => {
    if (
      (prompt || !!files?.length) &&
      !chatKit.inited &&
      !isFetchingWorkspace
    ) {
      let partsOrString: Message["parts"] | string;
      if (files?.length) {
        partsOrString = prepareMessageParts(t, prompt || "", files);
      } else {
        partsOrString = prompt || "";
      }
      chatKit.init(currentWorkspace?.cwd ?? undefined, partsOrString);
    }
  }, [currentWorkspace, isFetchingWorkspace, prompt, chatKit, files, t]);

  useSetSubtaskModel({ isSubTask, customAgent });

  usePendingModelAutoStart({
    enabled:
      status === "ready" &&
      messages.length === 1 &&
      !isModelsLoading &&
      !!selectedModel,
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

  useHandleChatEvents(
    isLoading || isModelsLoading || !selectedModel ? undefined : sendMessage,
  );

  return (
    <div className="mx-auto flex h-screen max-w-6xl flex-col">
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
        hideEmptyPlaceholder={isNewTaskWithContent}
      />
      <div className="relative flex flex-col px-4">
        {!isWorkspaceActive ? (
          <WorkspaceRequiredPlaceholder
            isFetching={isFetchingWorkspace}
            className="mb-12"
          />
        ) : (
          <ChatToolbar
            chat={chat}
            task={task}
            todosRef={todosRef}
            compact={chatKit.spawn}
            approvalAndRetry={approvalAndRetry}
            attachmentUpload={attachmentUpload}
            isSubTask={isSubTask}
            subtask={subtask}
            displayError={displayError}
            onUpdateIsPublicShared={chatKit.updateIsPublicShared}
          />
        )}
      </div>
    </div>
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
