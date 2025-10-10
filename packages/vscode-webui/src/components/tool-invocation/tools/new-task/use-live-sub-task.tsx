import type { TaskThreadSource } from "@/components/task-thread";
import {
  type ToolCallLifeCycle,
  type ToolCallStatusRegistry,
  useLiveChatKitGetters,
  useToolCallLifeCycle,
} from "@/features/chat";
import {
  ReadyForRetryError,
  useMixinReadyForRetryError,
  useRetry,
} from "@/features/retry";
import { useTodos } from "@/features/todo";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import type { Todo } from "@getpochi/tools";
import { useStore } from "@livestore/react";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import { getToolName, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ToolProps } from "../../types";

export function useLiveSubTask(
  { tool, isExecuting }: Pick<ToolProps<"newTask">, "tool" | "isExecuting">,
  toolCallStatusRegistry: ToolCallStatusRegistry,
): TaskThreadSource {
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName: getToolName(tool),
    toolCallId: tool.toolCallId,
  });

  const { customAgent, customAgentModel } = useCustomAgent(
    tool.state !== "input-streaming" ? tool.input?.agentType : undefined,
  );

  const abortController = useRef(new AbortController());

  useEffect(() => {
    const streamingResult = ensureNewTaskStreamingResult(
      lifecycle.streamingResult,
    );
    if (!isExecuting || !streamingResult) {
      return;
    }

    const { abortSignal } = streamingResult;
    const onAbort = () => {
      abortController.current.abort(abortSignal.reason);
    };
    abortSignal.addEventListener("abort", onAbort);
    return () => {
      abortSignal.removeEventListener("abort", onAbort);
    };
  }, [isExecuting, lifecycle.streamingResult]);

  // biome-ignore lint/style/noNonNullAssertion: uid must have been set.
  const uid = tool.input?._meta?.uid!;
  const { store } = useStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  const todosRef = useRef<Todo[] | undefined>(undefined);

  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask: true,
    modelOverride: customAgentModel,
  });

  // FIXME: handle auto retry for output without task.
  const chatKit = useLiveChatKit({
    taskId: uid,
    abortSignal: abortController.current.signal,
    getters,
    isSubTask: true,
    customAgent,
    sendAutomaticallyWhen: (x) => {
      const streamingResult = ensureNewTaskStreamingResult(
        lifecycle.streamingResult,
      );
      if (!streamingResult || abortController.current.signal.aborted) {
        return false;
      }
      // AI SDK v5 will retry regardless of the status if sendAutomaticallyWhen is set.
      if (chatKit.chat.status === "error") {
        return false;
      }
      return lastAssistantMessageIsCompleteWithToolCalls(x);
    },
    onToolCall: async ({ toolCall }) => {
      const streamingResult = ensureNewTaskStreamingResult(
        lifecycle.streamingResult,
      );
      if (!streamingResult) {
        throw new Error("Unexpected parent toolCall state");
      }

      // completion tools
      if (
        toolCall.toolName === "attemptCompletion" ||
        toolCall.toolName === "askFollowupQuestion"
      ) {
        // no-op
        return;
      }

      toolCallStatusRegistry.set(toolCall, {
        isExecuting: true,
      });
      const result = await vscodeHost.executeToolCall(
        toolCall.toolName,
        toolCall.input,
        {
          toolCallId: toolCall.toolCallId,
          abortSignal: ThreadAbortSignal.serialize(
            abortController.current.signal,
          ),
          nonInteractive: true,
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

        const unsubscribe = signal.subscribe((output) => {
          if (output.status === "completed") {
            unsubscribe();
            const result: Record<string, unknown> = {
              output: output.content,
              isTruncated: output.isTruncated ?? false,
            };
            // do not set error property if it is undefined
            if (output.error) {
              result.error = output.error;
            }
            addToolResult({
              // @ts-expect-error
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              output: result,
            });
            toolCallStatusRegistry.set(toolCall, {
              isExecuting: false,
            });
          } else {
            toolCallStatusRegistry.set(toolCall, {
              isExecuting: true,
              streamingResult: {
                toolName: "executeCommand",
                output: signal.value,
              },
            });
          }
        });
        return;
      }

      toolCallStatusRegistry.set(toolCall, {
        isExecuting: false,
      });

      addToolResult({
        // @ts-expect-error
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        // @ts-expect-error
        output: result,
      });
    },
  });

  const {
    messages,
    status,
    error,
    setMessages,
    sendMessage,
    addToolResult,
    regenerate,
  } = useChat({
    chat: chatKit.chat,
  });

  const [retryCount, setRetryCount] = useState(0);
  const retryImpl = useRetry({
    messages,
    setMessages,
    sendMessage,
    regenerate,
  });
  const retry = useCallback(
    (error?: Error) => {
      if (isExecuting && (status === "ready" || status === "error")) {
        retryImpl(error ?? new ReadyForRetryError());
      }
    },
    [retryImpl, status, isExecuting],
  );
  const retryWithCount = useCallback(
    (error?: Error) => {
      const streamingResult = ensureNewTaskStreamingResult(
        lifecycle.streamingResult,
      );
      if (!isExecuting || !streamingResult) {
        return;
      }
      setRetryCount((count) => count + 1);
      if (retryCount > SubtaskMaxRetry) {
        streamingResult.throws(
          "The sub-task failed to complete, max retry count reached.",
        );
        return;
      }
      retry(error);
    },
    [retry, retryCount, lifecycle.streamingResult, isExecuting],
  );

  const errorForRetry = useMixinReadyForRetryError(messages, error);
  const [
    pendingErrorForRetry,
    setPendingErrorForRetry,
    setDebouncedPendingErrorForRetry,
  ] = useDebounceState<Error | undefined>(undefined, 1000);
  useEffect(() => {
    if (
      isExecuting &&
      errorForRetry &&
      (status === "ready" || status === "error")
    ) {
      setPendingErrorForRetry(errorForRetry);
    }
  }, [errorForRetry, setPendingErrorForRetry, status, isExecuting]);
  useEffect(() => {
    const streamingResult = ensureNewTaskStreamingResult(
      lifecycle.streamingResult,
    );
    if (!isExecuting || !streamingResult) {
      return;
    }
    if (pendingErrorForRetry) {
      setDebouncedPendingErrorForRetry(undefined);
      retryWithCount(pendingErrorForRetry);
    }
  }, [
    retryWithCount,
    pendingErrorForRetry,
    setDebouncedPendingErrorForRetry,
    lifecycle.streamingResult,
    isExecuting,
  ]);

  useEffect(() => {
    if (isExecuting && status === "ready" && errorForRetry === undefined) {
      // Reset retry count when status is ok and no error
      setRetryCount(0);
    }
  }, [isExecuting, status, errorForRetry]);

  const stepCount = useMemo(() => {
    return messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "step-start").length;
  }, [messages]);
  const [currentStepCount, setCurrentStepCount] = useState(0);
  useEffect(() => {
    if (isExecuting && stepCount > currentStepCount) {
      setCurrentStepCount(stepCount);
    }
  }, [stepCount, currentStepCount, isExecuting]);

  useEffect(() => {
    const streamingResult = ensureNewTaskStreamingResult(
      lifecycle.streamingResult,
    );
    if (!isExecuting || !streamingResult) {
      return;
    }
    if (currentStepCount > SubtaskMaxStep) {
      streamingResult.throws(
        "The sub-task failed to complete, max step count reached.",
      );
    }
  }, [currentStepCount, lifecycle.streamingResult, isExecuting]);

  useInitAutoStart({
    start: retry,
    enabled:
      tool.state === "input-available" &&
      isExecuting &&
      currentStepCount <= SubtaskMaxStep &&
      !abortController.current.signal.aborted &&
      // task is not completed or aborted
      !(
        (task?.status === "failed" && task.error?.kind === "AbortError") ||
        task?.status === "completed"
      ),
  });

  const { todos } = useTodos({
    initialTodos: task?.todos,
    messages,
    todosRef,
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const updateIsLoading = () => {
      setIsLoading(
        !!(
          ensureNewTaskStreamingResult(lifecycle.streamingResult) &&
          !abortController.current.signal.aborted &&
          (status === "submitted" || status === "streaming") &&
          [...toolCallStatusRegistry.entries()].every(
            ([_, value]) => !value.isExecuting,
          )
        ),
      );
    };
    updateIsLoading();

    const unsubscribe = toolCallStatusRegistry.on("updated", updateIsLoading);
    return () => unsubscribe();
  }, [toolCallStatusRegistry, lifecycle.streamingResult, status]);

  return {
    messages,
    todos,
    isLoading,
  };
}

const SubtaskMaxStep = 24;
const SubtaskMaxRetry = 2;

const useInitAutoStart = ({
  start,
  enabled,
}: {
  start: () => void;
  enabled: boolean;
}) => {
  const initStarted = useRef(false);
  useEffect(() => {
    if (enabled && !initStarted.current) {
      initStarted.current = true;
      start();
    }
  }, [start, enabled]);
};

const ensureNewTaskStreamingResult = (
  streamingResult: ToolCallLifeCycle["streamingResult"],
) => {
  if (streamingResult?.toolName !== "newTask") {
    return undefined;
  }
  return streamingResult;
};
