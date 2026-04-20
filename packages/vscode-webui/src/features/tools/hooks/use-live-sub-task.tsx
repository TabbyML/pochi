import type { TaskThreadSource } from "@/components/task-thread";
import {
  type ToolCallLifeCycle,
  type ToolCallStatusRegistry,
  useBatchExecuteManager,
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
import { blobStore } from "@/lib/remote-blob-store";
import { useDefaultStore } from "@/lib/use-default-store";

import { vscodeHost } from "@/lib/vscode";
import { useChat } from "@ai-sdk/react";
import type { BuiltinSubAgentInfo } from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import { type Todo, getToolArgs } from "@getpochi/tools";
import {
  getStaticToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createExecutorToolCallAdapter } from "../../chat/lib/scheduled-tool-call-adapters";
import type { ToolProps } from "../components/types";

export function useLiveSubTask(
  { tool, isExecuting }: Pick<ToolProps<"newTask">, "tool" | "isExecuting">,
  toolCallStatusRegistry: ToolCallStatusRegistry,
): (TaskThreadSource & { parentId: string }) | undefined {
  const { getToolCallLifeCycle } = useToolCallLifeCycle();
  const batchExecuteManager = useBatchExecuteManager();
  const lifecycle = getToolCallLifeCycle({
    toolName: getStaticToolName(tool),
    toolCallId: tool.toolCallId,
  });

  const { customAgent, customAgentModel } = useCustomAgent(
    tool.state !== "input-streaming" ? tool.input?.agentType : undefined,
  );
  // biome-ignore lint/style/noNonNullAssertion: uid must have been set.
  const uid = tool.input?._meta?.uid!;
  const subtaskCustomAgentsRef = useRef(
    customAgent ? [customAgent] : undefined,
  );
  subtaskCustomAgentsRef.current = customAgent ? [customAgent] : undefined;

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
      batchExecuteManager.abort(
        uid,
        abortSignal.reason === "previous-tool-call-failed"
          ? "previous-tool-call-failed"
          : "user-abort",
      );
    };
    abortSignal.addEventListener("abort", onAbort);
    return () => {
      abortSignal.removeEventListener("abort", onAbort);
    };
  }, [batchExecuteManager, isExecuting, lifecycle.streamingResult, uid]);

  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask: true,
    omitCustomRules: customAgent?.omitAgentsMd === true,
    modelOverride: customAgentModel,
  });

  // FIXME: handle auto retry for output without task.
  const chatKit = useLiveChatKit({
    store,
    blobStore,
    taskId: uid,
    abortSignal: abortController.current.signal,

    getters,
    isSubTask: true,
    customAgent,
    onCompact: () => {
      vscodeHost.clearFileStateCache(uid);
    },
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

      // Must be sub-task
      if (!task?.parentId) {
        return;
      }

      const builtinSubAgentInfo: BuiltinSubAgentInfo | undefined =
        tool.input?.agentType === "browser"
          ? {
              type: tool.input.agentType,
              sessionId: uid,
            }
          : tool.input?.agentType === "planner"
            ? {
                type: "planner",
              }
            : tool.input?.agentType === "explore"
              ? { type: "explore" }
              : undefined;
      const executeCommandWhitelist = getToolArgs(
        customAgent?.tools,
        "executeCommand",
      );

      if (abortController.current.signal.aborted) {
        throw new Error("Subtask batch queue aborted");
      }

      await new Promise<void>((resolve, reject) => {
        batchExecuteManager.enqueue(
          uid,
          createExecutorToolCallAdapter({
            toolCall,
            uid,
            storeId: store.storeId,
            abortSignal: abortController.current.signal,
            contentType: customAgentModel?.contentType,
            builtinSubAgentInfo,
            executeCommandWhitelist,
            addToolOutput,
            toolCallStatusRegistry,
            resolve,
            reject,
          }),
          {
            // Classify batches against the latest subtask agent view.
            getCustomAgents: () => subtaskCustomAgentsRef.current,
          },
        );
        batchExecuteManager.processQueue(uid);
      });
    },
  });

  const {
    messages,
    status,
    error,
    setMessages,
    sendMessage,
    addToolOutput,
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
    clearFileStateCache: () => vscodeHost.clearFileStateCache(uid),
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

  if (!task) {
    // The task is not found in store, useLiveSubTask is not available
    return undefined;
  }

  if (!task.parentId) {
    throw new Error("Sub task must have parentId");
  }

  return {
    parentId: task.parentId,
    messages,
    todos,
    isLoading,
  };
}

const SubtaskMaxStep = 65535;
const SubtaskMaxRetry = 8;

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
