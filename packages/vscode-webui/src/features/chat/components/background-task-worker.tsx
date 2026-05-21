/**
 * BackgroundTaskWorker — drives a single background task to completion.
 *
 * Headless component (renders null). Receives a taskId and an optional tool
 * allow-list, then drives the task from the store.
 */

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
// After this many consecutive rejected (allow-list) tool calls we stop the
// worker to avoid the model getting stuck in a loop calling forbidden tools.
const BackgroundTaskMaxToolRejections = 5;
const logger = getLogger("BackgroundTaskWorker");

interface BackgroundTaskWorkerProps {
  taskId: string;
  batchExecuteManager: BatchExecuteManager;
}

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
  // Refs that bridge values defined later in the component body into callbacks
  // passed to `useLiveChatKit` (which is created before those values exist).
  // This avoids accidental TDZ access if the callbacks ever ran synchronously.
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

  const persistLastMessage = useCallback(() => {
    const lastMessage = chatKitRef.current?.chat.messages.at(-1);
    if (!lastMessage) return;
    // Final background turns may not make another request, so flush tool outputs now.
    store.commit(catalog.events.updateMessages({ messages: [lastMessage] }));
  }, [store]);

  // Wrap the latest `addToolOutput` (delivered via ref) so adapters can invoke
  // it even though they're constructed inside `onToolCall` before
  // `useChat`-bound `addToolOutput` exists in the closure.
  const adapterAddToolOutput = useCallback(
    async (args: AddToolOutputArgs) => {
      await addToolOutputRef.current?.(args);
      persistLastMessage();
    },
    [persistLastMessage],
  );

  const writeToolOutput = useCallback(
    (toolName: string, toolCallId: string, output: unknown) => {
      void adapterAddToolOutput({
        tool: toolName,
        toolCallId,
        output,
      });
    },
    [adapterAddToolOutput],
  );

  useEffect(() => {
    const signal = abortController.current.signal;
    const onAbort = () => {
      // Cancel all queued / in-flight tool calls for this task so that the
      // batch manager doesn't leave dangling subscriptions or pending items.
      batchExecuteManager.abort(taskId, "user-abort");
    };
    signal.addEventListener("abort", onAbort);
    return () => {
      signal.removeEventListener("abort", onAbort);
    };
  }, [taskId, batchExecuteManager]);

  // NOTE: Intentionally do NOT abort on unmount.
  //
  // Background tasks are designed to be resumable: if the webview / page is
  // closed mid-task, the next time it is opened `BackgroundTaskRunner` will
  // re-discover the task via `runnableTasks$` (status is still
  // `pending-model` / `pending-tool`) and re-mount this worker, which will
  // pick up from the last persisted message.
  //
  // Calling `abortController.abort()` here would propagate through the chat
  // and trigger `markAsFailed({ kind: "AbortError" })`, taking the task out
  // of `runnableTasks$` permanently. Letting the browser context tear down
  // is sufficient to terminate in-flight work when the page actually closes;
  // for React re-mounts (StrictMode, hot reload, etc.) the next mount will
  // resume cleanly.
  //
  // In-flight `executeCommand` ThreadSignal subscriptions are still released
  // through the worker's own abort paths (`failWorker`, max-retry,
  // max-step, max-tool-rejection), so we don't leak in those scenarios.

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
        abortController.current.signal.aborted ||
        completedRef.current ||
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

      // Kick off the queued tool calls (if any) so that batch-eligible items
      // run concurrently while stateful items remain serial barriers.
      if (!abortController.current.signal.aborted) {
        batchExecuteManager.processQueue(taskId);
      }

      if (terminalToolSeen) {
        completedRef.current = true;
      }
    },
    onToolCall: ({ toolCall }) => {
      if (completedRef.current) {
        return;
      }

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
        writeToolOutput(toolCall.toolName, toolCall.toolCallId, {
          output: `Tool ${toolCall.toolName} is not allowed for this background task.`,
        });

        if (toolRejectionCountRef.current >= BackgroundTaskMaxToolRejections) {
          failWorkerRef.current?.(
            `The background task kept calling disallowed tools (${toolRejectionCountRef.current}). Stopping.`,
          );
        }
        return;
      }

      // Reset the rejection counter once the model recovers and calls an
      // allowed tool again.
      toolRejectionCountRef.current = 0;

      if (abortController.current.signal.aborted) {
        return;
      }

      // Defer execution to the BatchExecuteManager: consecutive safe-to-batch
      // calls (read-only, newTask, startBackgroundJob) run as one
      // concurrent batch; stateful calls remain serial barriers.
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

  // Keep refs in sync so callbacks captured by `useLiveChatKit` always read
  // the latest values without re-creating the chat kit.
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
      // Idempotent: avoid re-aborting / re-committing taskFailed when callers
      // (e.g. the max-step watcher) re-fire on subsequent renders.
      if (completedRef.current) {
        return;
      }
      logger.warn({ taskId, message }, "Failing background task worker");
      completedRef.current = true;
      if (!abortController.current.signal.aborted) {
        abortController.current.abort(message);
      }
      chatKit.markAsFailed(new Error(message));
    },
    [chatKit, taskId],
  );
  // Bridge `failWorker` into the `onToolCall` closure (which is created via
  // `useLiveChatKit` before `failWorker` exists).
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
      if (
        completedRef.current ||
        abortController.current.signal.aborted ||
        !(status === "ready" || status === "error")
      ) {
        return;
      }
      void retryImpl(retryError ?? new ReadyForRetryError());
    },
    [retryImpl, status],
  );

  const [retryCount, setRetryCount] = useState(0);
  const retryWithCount = useCallback(
    (retryError?: Error) => {
      if (completedRef.current || abortController.current.signal.aborted) {
        return;
      }
      if (retryCount >= BackgroundTaskMaxRetry) {
        failWorker(
          "The background task failed to complete, max retry count reached.",
        );
        return;
      }
      setRetryCount((count) => count + 1);
      retry(retryError);
    },
    [failWorker, retry, retryCount],
  );

  // The retry pipeline:
  // 1. `errorForRetry` becomes truthy when chat reports a recoverable error.
  // 2. Debounce the error for 1s so transient flips don't trigger spurious retries.
  // 3. After debounce, the second effect picks up `pendingErrorForRetry`,
  //    immediately clears it (so this only fires once per error), and kicks off
  //    `retryWithCount`.
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
    if (
      completedRef.current ||
      abortController.current.signal.aborted ||
      !pendingErrorForRetry
    ) {
      return;
    }
    setPendingErrorForRetryNow(undefined);
    retryWithCount(pendingErrorForRetry);
  }, [pendingErrorForRetry, retryWithCount, setPendingErrorForRetryNow]);

  useEffect(() => {
    if (status === "ready" && errorForRetry === undefined) {
      setRetryCount(0);
    }
  }, [status, errorForRetry]);

  const stepCount = useMemo(() => countStepStarts(messages), [messages]);
  // Subtract the parent's baseline so only the fork's own steps count.
  const effectiveStepCount = Math.max(0, stepCount - baselineStepCount);

  // Guard fires on mount so auto-start below never resumes an over-budget task.
  useEffect(() => {
    if (completedRef.current) {
      return;
    }
    if (effectiveStepCount > BackgroundTaskMaxStep) {
      failWorker(
        "The background task failed to complete, max step count reached.",
      );
    }
  }, [effectiveStepCount, failWorker]);

  // Auto-start / resume the worker from its current last message.
  // Only kicks in when the task already has at least one message, since
  // background tasks are initialized by their parent task before this worker
  // mounts.
  const initStarted = useRef(false);
  useEffect(() => {
    if (
      !initStarted.current &&
      status === "ready" &&
      !isModelsLoading &&
      !!selectedModel &&
      messages.length > 0 &&
      !completedRef.current &&
      !abortController.current.signal.aborted &&
      // Belt-and-suspenders: never resume an over-budget task.
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
  ]);

  return null;
}

// Loose type alias: the full `addToolOutput` signature in `useChat` is
// over-constrained for our dynamic tool-call dispatch, so we widen it here.
type AddToolOutputArgs = {
  tool: string;
  toolCallId: string;
  output: unknown;
};
