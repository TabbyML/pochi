import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { ChatContextProvider, useHandleChatEvents } from "@/features/chat";
import { usePendingModelAutoStart } from "@/features/retry";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { prepareMessageParts } from "@/lib/message-utils";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { formatters } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
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
import { useApprovalAndRetry } from "../approval";
import { useSelectedModels } from "../settings";
import { ChatArea } from "./components/chat-area";
import { ChatToolbar } from "./components/chat-toolbar";
import { ErrorMessageView } from "./components/error-message-view";
import { SubtaskHeader } from "./components/subtask";
import { useRestoreTaskModel } from "./hooks/use-restore-task-model";
import { useScrollToBottom } from "./hooks/use-scroll-to-bottom";
import { useSetSubtaskModel } from "./hooks/use-set-subtask-model";
import { useAddSubtaskResult } from "./hooks/use-subtask-completed";
import { useSubtaskInfo } from "./hooks/use-subtask-info";
import { useAutoApproveGuard, useChatAbortController } from "./lib/chat-state";
import { onOverrideMessages } from "./lib/on-override-messages";
import { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";

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
  const isInitialTaskUpdate = useRef(true);

  const defaultUser = {
    name: t("chatPage.defaultUserName"),
    image: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(store.clientId)}&scale=120`,
  };

  const chatAbortController = useChatAbortController();
  useAbortBeforeNavigation(chatAbortController.current);

  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  useEffect(() => {
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
        }),
      );
    }
  }, [task]);

  const subtask = useSubtaskInfo(uid, task?.parentId);
  const {
    isLoading: isModelsLoading,
    selectedModel,
    updateSelectedModelId,
  } = useSelectedModels({
    isSubTask: !!subtask,
  });
  const { customAgent } = useCustomAgent(subtask?.agent);
  const autoApproveGuard = useAutoApproveGuard();
  const { data: currentWorkspace, isFetching: isFetchingWorkspace } =
    useCurrentWorkspace();
  const isWorkspaceActive = !!currentWorkspace?.cwd;
  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask: !!subtask,
  });

  useRestoreTaskModel(task, isModelsLoading, updateSelectedModelId);

  const chatKit = useLiveChatKit({
    taskId: uid,
    getters,
    isSubTask: !!subtask,
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
  });

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Use the unified image upload hook
  const attachmentUpload = useAttachmentUpload();

  const chat = useChat({
    chat: chatKit.chat,
    onFinish: () => {
      console.log("finish");
    },
  });

  const { messages, sendMessage, status } = chat;
  const renderMessages = useMemo(() => formatters.ui(messages), [messages]);
  const isLoading = status === "streaming" || status === "submitted";

  const approvalAndRetry = useApprovalAndRetry({
    ...chat,
    showApproval: !isLoading && !isModelsLoading && !!selectedModel,
    isSubTask: !!subtask,
  });

  // const [visible, setVisible] = useState(false)
  // useEffect(() => {
  //   window.addEventListener('')
  // }, [])

  const { pendingApproval, retry } = approvalAndRetry;

  useEffect(() => {
    if (prompt && !chatKit.inited && !isFetchingWorkspace) {
      let partsOrString: Message["parts"] | string;
      if (files?.length) {
        partsOrString = prepareMessageParts(t, prompt, files);
      } else {
        partsOrString = prompt;
      }
      chatKit.init(currentWorkspace?.cwd ?? undefined, partsOrString);
    }
  }, [currentWorkspace, isFetchingWorkspace, prompt, chatKit, files, t]);

  useSetSubtaskModel({ isSubTask: !!subtask, customAgent });

  usePendingModelAutoStart({
    enabled:
      status === "ready" &&
      messages.length === 1 &&
      !isModelsLoading &&
      !!selectedModel,
    task,
    retry,
  });

  const { jwt } = usePochiCredentials();
  useEffect(() => {
    isInitialTaskUpdate.current = true;
    const unsubscribe = store.subscribe(catalog.queries.makeTaskQuery(uid), {
      onUpdate: async (task) => {
        if (isInitialTaskUpdate.current) {
          isInitialTaskUpdate.current = false;
          return;
        }

        if (!task?.cwd) return;
        const isTaskPanelVisible = await vscodeHost.isTaskPanelVisible({
          cwd: task?.cwd,
          uid: task?.id,
        });
        if (isTaskPanelVisible) {
          return;
        }

        if (
          task?.status === "pending-input" ||
          task?.status === "completed" ||
          (task?.status === "failed" && pendingApproval?.name !== "retry")
        ) {
          let renderMessage = "";
          switch (task.status) {
            case "pending-input":
              renderMessage = t("notification.task.status.pendingInput");
              break;
            case "completed":
              renderMessage = t("notification.task.status.completed");
              break;
            case "failed":
              renderMessage = t("notification.task.status.failed");
              break;
            default:
              break;
          }

          const result = await vscodeHost.showInformationMessage(
            renderMessage,
            {
              modal: false,
            },
            t("notification.task.action.viewDetail"),
          );
          if (result === t("notification.task.action.viewDetail") && task.cwd) {
            // do navigation
            const storeId = encodeStoreId(jwt, task.parentId || task.id);
            vscodeHost.openTaskInPanel({
              uid: task.id,
              cwd: task.cwd,
              storeId,
            });
          }
        }
      },
    });

    return () => unsubscribe();
  }, [uid, store.subscribe, pendingApproval, jwt, t]);

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
      />
      <div className="flex flex-col px-4">
        <ErrorMessageView error={displayError} />
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
            isSubTask={!!subtask}
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
