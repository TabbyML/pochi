import {
  ReadyForRetryError,
  useMixinReadyForRetryError,
  useRetry,
} from "@/features/retry";
import { useSelectedModels } from "@/features/settings";
import { useTodos } from "@/features/todo";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { blobStore } from "@/lib/remote-blob-store";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { type ForkAgentUseCase, getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import {
  type Todo,
  type ToolSpecInput,
  compileToolPolicies,
  getAllowedToolNames,
  isCompletionToolName,
} from "@getpochi/tools";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BatchExecuteManager } from "../lib/batch-execute-manager";
import { createBackgroundTaskBatchedToolCall } from "../lib/batched-tool-call-adapters";
import { countStepStarts } from "../lib/create-fork-agent";
import { useLiveChatKitGetters } from "../lib/use-live-chat-kit-getters";

const BackgroundTaskMaxStep = 50;
const BackgroundTaskMaxRetry = 8;
const BackgroundTaskMaxToolRejections = 5;
const logger = getLogger("BackgroundTaskWorker");

interface BackgroundTaskWorkerProps {
  taskId: string;
  batchExecuteManager: BatchExecuteManager;
}

type AddToolOutputArgs = {
  tool: string;
  toolCallId: string;
  output: unknown;
};

export function BackgroundTaskWorker({
  taskId,
  batchExecuteManager,
}: BackgroundTaskWorkerProps) {
  const { backgroundTaskState, isLoading } = useBackgroundTaskState(taskId);

  if (isLoading) return null;

  return (
    <BackgroundTaskWorkerInner
      taskId={taskId}
      tools={backgroundTaskState?.tools}
      parentTaskId={backgroundTaskState?.parentTaskId}
      requestUseCase={backgroundTaskState?.useCase}
      baselineStepCount={backgroundTaskState?.baselineStepCount}
      batchExecuteManager={batchExecuteManager}
    />
  );
}

function BackgroundTaskWorkerInner({
  taskId,
  tools,
  parentTaskId,
  requestUseCase,
  baselineStepCount = 0,
  batchExecuteManager,
}: BackgroundTaskWorkerProps & {
  tools?: readonly ToolSpecInput[];
  parentTaskId?: string;
  requestUseCase?: ForkAgentUseCase;
  baselineStepCount?: number;
}) {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const { isLoading: isModelsLoading, selectedModel } = useSelectedModels({
    isSubTask: false,
  });
  const abortController = useRef(new AbortController());
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const completedRef = useRef(false);
  const terminalToolSeenRef = useRef(false);
  const toolRejectionCountRef = useRef(0);
  const chatKitRef = useRef<ReturnType<typeof useLiveChatKit> | null>(null);
  const addToolOutputRef = useRef<
    ((args: AddToolOutputArgs) => void | Promise<void>) | null
  >(null);
  const chatStatusRef = useRef<string | null>(null);

  const allowedToolsSet = useMemo(
    () => (tools ? getAllowedToolNames([...tools]) : undefined),
    [tools],
  );
  const toolPolicies = useMemo(
    () => (tools ? compileToolPolicies([...tools]) : undefined),
    [tools],
  );

  const isAborted = useCallback(
    () => completedRef.current || abortController.current.signal.aborted,
    [],
  );

  const persistLastMessage = useCallback(() => {
    const lastMessage = chatKitRef.current?.chat.messages.at(-1);
    if (!lastMessage) return;
    // Final background turns may not make another request; flush eagerly.
    store.commit(catalog.events.updateMessages({ messages: [lastMessage] }));
  }, [store]);

  const adapterAddToolOutput = useCallback(
    async (args: AddToolOutputArgs) => {
      await addToolOutputRef.current?.(args);
      persistLastMessage();
    },
    [persistLastMessage],
  );

  useEffect(() => {
    const signal = abortController.current.signal;
    const onAbort = () => batchExecuteManager.abort(taskId, "user-abort");
    signal.addEventListener("abort", onAbort);
    return () => signal.removeEventListener("abort", onAbort);
  }, [taskId, batchExecuteManager]);

  // NOTE: Do NOT abort on unmount. Background tasks are resumable —
  // `BackgroundTaskRunner` re-mounts this worker via `runnableTasks$` after
  // webview close. Aborting here would mark the task `AbortError` and drop
  // it from `runnableTasks$` permanently.

  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask: false,
    modelOverride: selectedModel,
    taskId,
  });

  const chatKit = useLiveChatKit({
    store,
    blobStore,
    taskId,
    abortSignal: abortController.current.signal,
    getters,
    isSubTask: false,
    requestUseCase,
    sendAutomaticallyWhen: (x) => {
      if (
        isAborted() ||
        isModelsLoading ||
        !selectedModel ||
        chatStatusRef.current === "error"
      ) {
        return false;
      }
      return lastAssistantMessageIsCompleteWithToolCalls(x);
    },
    onStreamFinish: () => {
      const terminalToolSeen = terminalToolSeenRef.current;
      terminalToolSeenRef.current = false;

      if (!abortController.current.signal.aborted) {
        batchExecuteManager.processQueue(taskId);
      }

      if (terminalToolSeen) {
        completedRef.current = true;
      }
    },
    onToolCall: ({ toolCall }) => {
      if (completedRef.current) return;

      if (isCompletionToolName(toolCall.toolName)) {
        terminalToolSeenRef.current = true;
        return;
      }

      if (allowedToolsSet && !allowedToolsSet.has(toolCall.toolName)) {
        toolRejectionCountRef.current += 1;
        logger.warn(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            allowedToolCount: allowedToolsSet.size,
            rejectionCount: toolRejectionCountRef.current,
          },
          "Background task tool call rejected by allow-list",
        );
        void adapterAddToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            output: `Tool ${toolCall.toolName} is not allowed for this background task.`,
          },
        });

        if (toolRejectionCountRef.current >= BackgroundTaskMaxToolRejections) {
          failWorkerRef.current?.(
            `The background task kept calling disallowed tools (${toolRejectionCountRef.current}). Stopping.`,
          );
        }
        return;
      }

      toolRejectionCountRef.current = 0;

      if (abortController.current.signal.aborted) return;

      batchExecuteManager.enqueue(
        taskId,
        createBackgroundTaskBatchedToolCall({
          toolCall,
          taskId,
          parentTaskId,
          storeId: store.storeId,
          abortSignal: abortController.current.signal,
          toolPolicies,
          addToolOutput: adapterAddToolOutput,
        }),
      );
    },
  });
  chatKitRef.current = chatKit;

  const {
    messages,
    status,
    error,
    setMessages,
    addToolOutput,
    sendMessage,
    regenerate,
  } = useChat({
    chat: chatKit.chat,
  });

  useEffect(() => {
    addToolOutputRef.current = addToolOutput as unknown as (
      args: AddToolOutputArgs,
    ) => Promise<void>;
  }, [addToolOutput]);

  useEffect(() => {
    chatStatusRef.current = status;
  }, [status]);

  useTodos({
    initialTodos: task?.todos,
    messages,
    todosRef,
  });

  const failWorker = useCallback(
    (message: string) => {
      if (completedRef.current) return;
      logger.warn({ taskId, message }, "Failing background task worker");
      completedRef.current = true;
      if (!abortController.current.signal.aborted) {
        abortController.current.abort(message);
      }
      chatKit.markAsFailed(new Error(message));
    },
    [chatKit, taskId],
  );
  const failWorkerRef = useRef(failWorker);
  useEffect(() => {
    failWorkerRef.current = failWorker;
  }, [failWorker]);

  const retryImpl = useRetry({
    messages,
    setMessages,
    sendMessage,
    regenerate,
    clearFileStateCache: () => vscodeHost.clearFileStateCache(taskId),
  });
  const retry = useCallback(
    (retryError?: Error) => {
      if (isAborted() || !(status === "ready" || status === "error")) return;
      void retryImpl(retryError ?? new ReadyForRetryError());
    },
    [retryImpl, status, isAborted],
  );

  const [retryCount, setRetryCount] = useState(0);
  const retryWithCount = useCallback(
    (retryError?: Error) => {
      if (isAborted()) return;
      if (retryCount >= BackgroundTaskMaxRetry) {
        failWorker(
          "The background task failed to complete, max retry count reached.",
        );
        return;
      }
      setRetryCount((count) => count + 1);
      retry(retryError);
    },
    [failWorker, retry, retryCount, isAborted],
  );

  const errorForRetry = useMixinReadyForRetryError(messages, error);
  const [
    pendingErrorForRetry,
    debouncedSetPendingErrorForRetry,
    setPendingErrorForRetryNow,
  ] = useDebounceState<Error | undefined>(undefined, 1000);
  useEffect(() => {
    if (
      !completedRef.current &&
      errorForRetry &&
      (status === "ready" || status === "error")
    ) {
      debouncedSetPendingErrorForRetry(errorForRetry);
    }
  }, [errorForRetry, debouncedSetPendingErrorForRetry, status]);
  useEffect(() => {
    if (isAborted() || !pendingErrorForRetry) return;
    setPendingErrorForRetryNow(undefined);
    retryWithCount(pendingErrorForRetry);
  }, [
    pendingErrorForRetry,
    retryWithCount,
    setPendingErrorForRetryNow,
    isAborted,
  ]);

  useEffect(() => {
    if (status === "ready" && errorForRetry === undefined) {
      setRetryCount(0);
    }
  }, [status, errorForRetry]);

  const stepCount = useMemo(() => countStepStarts(messages), [messages]);
  // Subtract parent baseline so only the fork's own steps count.
  const effectiveStepCount = Math.max(0, stepCount - baselineStepCount);

  useEffect(() => {
    if (completedRef.current) return;
    if (effectiveStepCount > BackgroundTaskMaxStep) {
      failWorker(
        "The background task failed to complete, max step count reached.",
      );
    }
  }, [effectiveStepCount, failWorker]);

  const initStarted = useRef(false);
  useEffect(() => {
    if (
      !initStarted.current &&
      status === "ready" &&
      !isModelsLoading &&
      !!selectedModel &&
      messages.length > 0 &&
      !isAborted() &&
      effectiveStepCount <= BackgroundTaskMaxStep &&
      !(
        (task?.status === "failed" && task.error?.kind === "AbortError") ||
        task?.status === "completed"
      )
    ) {
      initStarted.current = true;
      retry();
    }
  }, [
    status,
    isModelsLoading,
    selectedModel,
    messages.length,
    effectiveStepCount,
    retry,
    task?.status,
    task?.error,
    isAborted,
  ]);

  return null;
}
