/**
 * AsyncAgentWorker — drives a single async task to completion.
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
import { useAsyncAgentState } from "@/lib/hooks/use-async-agent-state";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { blobStore } from "@/lib/remote-blob-store";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BatchExecuteManager } from "../lib/batch-execute-manager";
import { createAsyncAgentBatchedToolCall } from "../lib/batched-tool-call-adapters";
import { useLiveChatKitGetters } from "../lib/use-live-chat-kit-getters";

const AsyncAgentMaxStep = 50;
const AsyncAgentMaxRetry = 8;
// After this many consecutive rejected (allow-list) tool calls we stop the agent
// to avoid the model getting stuck in a loop calling forbidden tools.
const AsyncAgentMaxToolRejections = 5;
const logger = getLogger("AsyncAgentWorker");

interface AsyncAgentWorkerProps {
  taskId: string;
  batchExecuteManager: BatchExecuteManager;
}

export function AsyncAgentWorker({
  taskId,
  batchExecuteManager,
}: AsyncAgentWorkerProps) {
  const { asyncAgentState, isLoading } = useAsyncAgentState(taskId);

  useEffect(() => {
    logger.debug(
      {
        taskId,
        isLoading,
        hasAsyncAgentState: asyncAgentState !== undefined,
        parentTaskId: asyncAgentState?.parentTaskId,
        allowedTools: asyncAgentState?.allowedTools?.length,
      },
      "Async agent state updated",
    );
  }, [taskId, isLoading, asyncAgentState]);

  if (isLoading) return null;

  return (
    <AsyncAgentWorkerInner
      taskId={taskId}
      allowedTools={asyncAgentState?.allowedTools}
      parentTaskId={asyncAgentState?.parentTaskId}
      batchExecuteManager={batchExecuteManager}
    />
  );
}

function AsyncAgentWorkerInner({
  taskId,
  allowedTools,
  parentTaskId,
  batchExecuteManager,
}: AsyncAgentWorkerProps & {
  allowedTools?: readonly string[];
  parentTaskId?: string;
}) {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const { isLoading: isModelsLoading, selectedModel } = useSelectedModels({
    isSubTask: false,
  });
  const abortController = useRef(new AbortController());
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const completedRef = useRef(false);
  const toolRejectionCountRef = useRef(0);
  // Refs that bridge values defined later in the component body into callbacks
  // passed to `useLiveChatKit` (which is created before those values exist).
  // This avoids accidental TDZ access if the callbacks ever ran synchronously.
  const addToolOutputRef = useRef<((args: AddToolOutputArgs) => void) | null>(
    null,
  );
  const chatStatusRef = useRef<string | null>(null);
  const allowedToolsSet = useMemo(
    () => (allowedTools ? new Set(allowedTools) : undefined),
    [allowedTools],
  );

  const writeToolOutput = useCallback(
    (toolName: string, toolCallId: string, output: unknown) => {
      addToolOutputRef.current?.({
        tool: toolName,
        toolCallId,
        output,
      });
    },
    [],
  );

  // Wrap the latest `addToolOutput` (delivered via ref) so adapters can invoke
  // it even though they're constructed inside `onToolCall` before
  // `useChat`-bound `addToolOutput` exists in the closure.
  const adapterAddToolOutput = useCallback((args: AddToolOutputArgs) => {
    addToolOutputRef.current?.(args);
  }, []);

  useEffect(() => {
    const signal = abortController.current.signal;
    const onAbort = () => {
      logger.debug(
        {
          taskId,
          reason: formatLogValue(signal.reason),
        },
        "Async agent aborted",
      );
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
  // Async agents are designed to be resumable: if the webview / page is
  // closed mid-task, the next time it is opened `AsyncAgentRunner` will
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
    onStreamFinish: (data) => {
      if (data.status === "completed") {
        logger.debug(
          {
            taskId,
            messageCount: data.messages.length,
            messages: data.messages,
          },
          "Async agent completed with messages",
        );
      }

      // Kick off the queued tool calls (if any) so that batch-eligible items
      // run concurrently while stateful items remain serial barriers.
      if (!abortController.current.signal.aborted) {
        batchExecuteManager.processQueue(taskId);
      }
    },
    onToolCall: async ({ toolCall }) => {
      logger.debug(
        {
          taskId,
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
        },
        "Async agent tool call received",
      );

      if (completedRef.current) {
        logger.debug(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
          },
          "Ignoring async agent tool call after completion",
        );
        return;
      }

      if (
        toolCall.toolName === "attemptCompletion" ||
        toolCall.toolName === "askFollowupQuestion"
      ) {
        completedRef.current = true;
        logger.debug(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
          },
          "Async agent completed by terminal tool call",
        );
        return;
      }

      if (allowedToolsSet && !allowedToolsSet.has(toolCall.toolName)) {
        toolRejectionCountRef.current += 1;
        logger.warn(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            allowedTools: allowedTools?.length,
            rejectionCount: toolRejectionCountRef.current,
          },
          "Async agent tool call rejected by allow-list",
        );
        writeToolOutput(toolCall.toolName, toolCall.toolCallId, {
          output: `Tool ${toolCall.toolName} is not allowed for this async agent.`,
        });

        if (toolRejectionCountRef.current >= AsyncAgentMaxToolRejections) {
          failWorkerRef.current?.(
            `The async agent kept calling disallowed tools (${toolRejectionCountRef.current}). Stopping.`,
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

      logger.debug(
        {
          taskId,
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          parentTaskId,
        },
        "Enqueueing async agent tool call",
      );

      // Defer execution to the BatchExecuteManager: consecutive safe-to-batch
      // calls (read-only, runAsync newTask, startBackgroundJob) run as one
      // concurrent batch; stateful calls remain serial barriers.
      batchExecuteManager.enqueue(
        taskId,
        createAsyncAgentBatchedToolCall({
          toolCall,
          taskId,
          parentTaskId,
          storeId: store.storeId,
          abortSignal: abortController.current.signal,
          addToolOutput: adapterAddToolOutput,
        }),
      );
    },
  });

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
    ) => void;
  }, [addToolOutput]);

  useEffect(() => {
    chatStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    logger.debug({ taskId }, "Async agent worker mounted");
    return () => {
      logger.debug({ taskId }, "Async agent worker unmounted");
    };
  }, [taskId]);

  useTodos({
    initialTodos: task?.todos,
    messages,
    todosRef,
  });

  const failWorker = useCallback(
    (message: string) => {
      logger.warn({ taskId, message }, "Failing async agent worker");
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
        logger.debug(
          {
            taskId,
            status,
            completed: completedRef.current,
            aborted: abortController.current.signal.aborted,
          },
          "Skipping async agent retry",
        );
        return;
      }
      logger.debug(
        {
          taskId,
          status,
          error: retryError ? formatLogValue(retryError) : undefined,
        },
        "Retrying async agent",
      );
      void retryImpl(retryError ?? new ReadyForRetryError());
    },
    [retryImpl, status, taskId],
  );

  const [retryCount, setRetryCount] = useState(0);
  const retryWithCount = useCallback(
    (retryError?: Error) => {
      if (completedRef.current || abortController.current.signal.aborted) {
        return;
      }
      if (retryCount >= AsyncAgentMaxRetry) {
        failWorker(
          "The async agent failed to complete, max retry count reached.",
        );
        return;
      }
      logger.debug(
        {
          taskId,
          retryCount: retryCount + 1,
          maxRetry: AsyncAgentMaxRetry,
          error: retryError ? formatLogValue(retryError) : undefined,
        },
        "Scheduling async agent retry",
      );
      setRetryCount((count) => count + 1);
      retry(retryError);
    },
    [failWorker, retry, retryCount, taskId],
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
      logger.debug(
        {
          taskId,
          status,
          error: formatLogValue(errorForRetry),
        },
        "Async agent error became ready for retry",
      );
      debouncedSetPendingErrorForRetry(errorForRetry);
    }
  }, [errorForRetry, debouncedSetPendingErrorForRetry, status, taskId]);
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
      if (retryCount > 0) {
        logger.debug(
          { taskId, retryCount },
          "Resetting async agent retry count",
        );
      }
      setRetryCount(0);
    }
  }, [status, errorForRetry, retryCount, taskId]);

  const stepCount = useMemo(() => {
    return messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "step-start").length;
  }, [messages]);
  const [currentStepCount, setCurrentStepCount] = useState(0);
  useEffect(() => {
    if (stepCount > currentStepCount) {
      logger.debug(
        {
          taskId,
          stepCount,
          previousStepCount: currentStepCount,
        },
        "Async agent advanced steps",
      );
      setCurrentStepCount(stepCount);
    }
  }, [stepCount, currentStepCount, taskId]);

  useEffect(() => {
    if (currentStepCount > AsyncAgentMaxStep) {
      failWorker("The async agent failed to complete, max step count reached.");
    }
  }, [currentStepCount, failWorker]);

  // Auto-start / resume the agent from its current last message.
  // Only kicks in when the task already has at least one message, since async
  // agents are initialized by their parent task before this worker mounts.
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
      !(
        (task?.status === "failed" && task.error?.kind === "AbortError") ||
        task?.status === "completed"
      )
    ) {
      initStarted.current = true;
      logger.debug(
        {
          taskId,
          status,
          taskStatus: task?.status,
          modelId: selectedModel.id,
          messageCount: messages.length,
          stepCount: currentStepCount,
        },
        "Starting async agent from current task state",
      );
      retry();
    }
  }, [
    status,
    isModelsLoading,
    selectedModel,
    messages.length,
    retry,
    task?.status,
    task?.error,
    taskId,
    currentStepCount,
  ]);

  useEffect(() => {
    logger.debug(
      {
        taskId,
        chatStatus: status,
        taskStatus: task?.status,
        messageCount: messages.length,
        error: error ? formatLogValue(error) : undefined,
      },
      "Async agent chat status updated",
    );
  }, [taskId, status, task?.status, messages.length, error]);

  return null;
}

// Loose type alias: the full `addToolOutput` signature in `useChat` is
// over-constrained for our dynamic tool-call dispatch, so we widen it here.
type AddToolOutputArgs = {
  tool: string;
  toolCallId: string;
  output: unknown;
};

function formatLogValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
