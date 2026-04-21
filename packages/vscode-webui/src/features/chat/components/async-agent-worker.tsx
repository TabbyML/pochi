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
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveChatKitGetters } from "../lib/use-live-chat-kit-getters";

const AsyncAgentMaxStep = 65535;
const AsyncAgentMaxRetry = 8;
const logger = getLogger("AsyncAgentWorker");

interface AsyncAgentWorkerProps {
  taskId: string;
}

export function AsyncAgentWorker({ taskId }: AsyncAgentWorkerProps) {
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
    />
  );
}

function AsyncAgentWorkerInner({
  taskId,
  allowedTools,
  parentTaskId,
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
  const allowedToolsSet = useMemo(
    () => (allowedTools ? new Set(allowedTools) : undefined),
    [allowedTools],
  );

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
    };
    signal.addEventListener("abort", onAbort);
    return () => {
      signal.removeEventListener("abort", onAbort);
    };
  }, [taskId]);

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
        chatKit.chat.status === "error"
      ) {
        return false;
      }
      return lastAssistantMessageIsCompleteWithToolCalls(x);
    },
    onStreamFinish: (data) => {
      if (data.status !== "completed") {
        return;
      }

      console.log(data.messages);
      logger.debug(
        {
          taskId,
          messageCount: data.messages.length,
          messages: data.messages,
        },
        "Async agent completed with messages",
      );
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
        logger.warn(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            allowedTools: allowedTools?.length,
          },
          "Async agent tool call rejected by allow-list",
        );
        addToolOutput({
          // @ts-expect-error dynamic tool name
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            output: `Tool ${toolCall.toolName} is not allowed for this async agent.`,
          },
        });
        return;
      }

      try {
        logger.debug(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            parentTaskId,
          },
          "Executing async agent tool call",
        );
        const result = await vscodeHost.executeToolCall(
          toolCall.toolName,
          toolCall.input,
          {
            toolCallId: toolCall.toolCallId,
            abortSignal: ThreadAbortSignal.serialize(
              abortController.current.signal,
            ),
            storeId: store.storeId,
            taskId,
            fileStateCacheSourceTaskId: parentTaskId,
          },
        );

        if (
          toolCall.toolName === "executeCommand" &&
          typeof result === "object" &&
          result !== null &&
          "output" in result
        ) {
          const signal = threadSignal(
            result.output as ThreadSignalSerialization<ExecuteCommandResult>,
          );

          logger.debug(
            {
              taskId,
              toolName: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
            },
            "Async agent executeCommand streaming result attached",
          );

          let lastStatus: ExecuteCommandResult["status"] | undefined;
          const unsubscribe = signal.subscribe((output) => {
            if (output.status !== lastStatus) {
              lastStatus = output.status;
              logger.debug(
                {
                  taskId,
                  toolName: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  status: output.status,
                },
                "Async agent executeCommand status updated",
              );
            }

            if (output.status !== "completed") {
              return;
            }

            unsubscribe();
            const finalResult: Record<string, unknown> = {
              output: output.content,
              isTruncated: output.isTruncated ?? false,
            };
            if (output.error) {
              finalResult.error = output.error;
            }
            logger.debug(
              {
                taskId,
                toolName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
                hasError: Boolean(output.error),
                outputLength: output.content.length,
                isTruncated: output.isTruncated ?? false,
              },
              "Async agent executeCommand completed",
            );
            addToolOutput({
              // @ts-expect-error dynamic tool name
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: finalResult,
            });
          });
          return;
        }

        logger.debug(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            result: summarizeResult(result),
          },
          "Async agent tool call completed",
        );
        addToolOutput({
          // @ts-expect-error dynamic tool name
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          // @ts-expect-error dynamic result type
          output: result,
        });
      } catch (error) {
        logger.warn(
          {
            taskId,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            error: formatLogValue(error),
          },
          "Async agent tool call failed",
        );
        addToolOutput({
          // @ts-expect-error dynamic tool name
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: {
            output:
              error instanceof Error ? error.message : "Unknown error occurred",
          },
        });
      }
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
      abortController.current.abort(message);
      chatKit.markAsFailed(new Error(message));
    },
    [chatKit, taskId],
  );

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

  const errorForRetry = useMixinReadyForRetryError(messages, error);
  const [
    pendingErrorForRetry,
    setPendingErrorForRetry,
    setDebouncedPendingErrorForRetry,
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
      setPendingErrorForRetry(errorForRetry);
    }
  }, [errorForRetry, setPendingErrorForRetry, status, taskId]);
  useEffect(() => {
    if (
      completedRef.current ||
      abortController.current.signal.aborted ||
      !pendingErrorForRetry
    ) {
      return;
    }
    setDebouncedPendingErrorForRetry(undefined);
    retryWithCount(pendingErrorForRetry);
  }, [pendingErrorForRetry, retryWithCount, setDebouncedPendingErrorForRetry]);

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

function summarizeResult(result: unknown): Record<string, unknown> {
  if (result === null || typeof result !== "object") {
    return { type: typeof result };
  }

  const objectResult = result as Record<string, unknown>;
  return {
    type: "object",
    keys: Object.keys(objectResult),
    hasOutput: "output" in objectResult,
    hasError: "error" in objectResult,
  };
}
