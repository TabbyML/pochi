import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { ChatContextProvider, useHandleChatEvents } from "@/features/chat";
import { usePendingModelAutoStart } from "@/features/retry";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useChat } from "@ai-sdk/react";
import { formatters } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { type Task, catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import { useStore } from "@livestore/react";
import { useRouter } from "@tanstack/react-router";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { useApprovalAndRetry } from "../approval";
import { useSelectedModels } from "../settings";
import { ChatArea } from "./components/chat-area";
import { ChatToolbar } from "./components/chat-toolbar";
import { ErrorMessageView } from "./components/error-message-view";
import { SubtaskHeader } from "./components/subtask";
import { useScrollToBottom } from "./hooks/use-scroll-to-bottom";
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
}

function Chat({ user, uid, prompt }: ChatProps) {
  const { store } = useStore();
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const getters = useLiveChatKitGetters({
    todos: todosRef,
  });

  const defaultUser = {
    name: "You",
    image: `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(store.clientId)}&scale=120`,
  };

  const chatAbortController = useChatAbortController();
  useAbortBeforeNavigation(chatAbortController.current);

  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  const isSubTask = !!task?.parentId;
  const subtask = useSubtaskInfo(uid, task?.parentId);
  const customAgent = useCustomAgent(subtask?.agent);

  const autoApproveGuard = useAutoApproveGuard();
  const { data: cwd = "default" } = useCurrentWorkspace();
  const chatKit = useLiveChatKit({
    cwd,
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
  });

  const { data: currentWorkspace, isFetching: isFetchingWorkspace } =
    useCurrentWorkspace();
  const isWorkspaceActive = !!currentWorkspace;

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Use the unified image upload hook
  const attachmentUpload = useAttachmentUpload();

  const chat = useChat({
    chat: chatKit.chat,
  });

  const { messages, sendMessage, status } = chat;
  const renderMessages = useMemo(() => formatters.ui(messages), [messages]);
  const { isLoading: isModelsLoading, selectedModel } = useSelectedModels();
  const isLoading = status === "streaming" || status === "submitted";

  const approvalAndRetry = useApprovalAndRetry({
    ...chat,
    showApproval: !isLoading && !isModelsLoading && !!selectedModel,
    isSubTask,
  });

  const { pendingApproval, retry } = approvalAndRetry;

  useEffect(() => {
    if (prompt && !chatKit.inited) {
      chatKit.init(prompt);
    }
  }, [prompt, chatKit]);

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
    <div className="flex h-screen flex-col">
      {isSubTask && subtask && <SubtaskHeader subtask={subtask} />}
      <ChatArea
        messages={renderMessages}
        isLoading={isLoading}
        user={user || defaultUser}
        messagesContainerRef={messagesContainerRef}
        agent={subtask?.agent}
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
