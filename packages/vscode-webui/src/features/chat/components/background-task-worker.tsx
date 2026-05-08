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
import {
  type ForkAgentUseCase,
  type MessageCacheBreakpoint,
  getLogger,
} from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import {
  type Todo,
  type ToolSpecInput,
  compileToolPolicies,
  getAllowedToolNames,
} from "@getpochi/tools";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BatchExecuteManager } from "../lib/batch-execute-manager";
import { createBackgroundTaskBatchedToolCall } from "../lib/batched-tool-call-adapters";
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
      messageCacheBreakpoint={backgroundTaskState?.messageCacheBreakpoint}
      requestUseCase={backgroundTaskState?.useCase}
      batchExecuteManager={batchExecuteManager}
    />
  );
}

function BackgroundTaskWorkerInner({
  taskId,
  tools,
  parentTaskId,
  messageCacheBreakpoint,
  requestUseCase,
  batchExecuteManager,
}: BackgroundTaskWorkerProps & {
  tools?: readonly ToolSpecInput[];
  parentTaskId?: string;
  messageCacheBreakpoint?: MessageCacheBreakpoint;
  requestUseCase?: ForkAgentUseCase;
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
    () => (tools ? getAllowedToolNames([...tools]) : undefined),
    [tools],
  );
  const toolPolicies = useMemo(
    () => (tools ? compileToolPolicies([...tools]) : undefined),
    [tools],
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
    messageCacheBreakpoint: messageCacheBreakpoint ?? "last",
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
    onStreamFinish: (data) => {
      if (data.status === "completed") {
        const conversation = summarizeMessages(data.messages);
        logger.debug(
          { taskId, messageCount: data.messages.length },
          `✔ stream-finish (${data.messages.length} msgs)\n${conversation}`,
        );
      }

      // Kick off the queued tool calls (if any) so that batch-eligible items
      // run concurrently while stateful items remain serial barriers.
      if (!abortController.current.signal.aborted) {
        batchExecuteManager.processQueue(taskId);
      }
    },
    onToolCall: async ({ toolCall }) => {
      if (completedRef.current) {
        return;
      }

      if (
        toolCall.toolName === "attemptCompletion" ||
        toolCall.toolName === "askFollowupQuestion"
      ) {
        completedRef.current = true;
        logger.debug(
          { taskId, toolName: toolCall.toolName },
          `✔ terminal tool ${toolCall.toolName}`,
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

      logger.debug(
        {
          taskId,
          toolCallId: toolCall.toolCallId,
          input: summarizeToolPayload((toolCall as { input?: unknown }).input),
        },
        `→ tool ${toolCall.toolName}`,
      );

      // Defer execution to the BatchExecuteManager: consecutive safe-to-batch
      // calls (read-only, runAsync newTask, startBackgroundJob) run as one
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
      logger.debug(
        {
          taskId,
          retryCount: retryCount + 1,
          error: retryError ? formatLogValue(retryError) : undefined,
        },
        `↻ retry #${retryCount + 1}`,
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

  const stepCount = useMemo(() => {
    return messages
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "step-start").length;
  }, [messages]);

  // Read `stepCount` directly so the guard fires on mount, before the
  // auto-start effect below can call `retry()` on an over-budget task.
  useEffect(() => {
    if (completedRef.current) {
      return;
    }
    if (stepCount > BackgroundTaskMaxStep) {
      failWorker(
        "The background task failed to complete, max step count reached.",
      );
    }
  }, [stepCount, failWorker]);

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
      stepCount <= BackgroundTaskMaxStep &&
      !(
        (task?.status === "failed" && task.error?.kind === "AbortError") ||
        task?.status === "completed"
      )
    ) {
      initStarted.current = true;
      logger.debug(
        {
          taskId,
          modelId: selectedModel.id,
          messageCount: messages.length,
          stepCount,
        },
        "▶ start background task",
      );
      retry();
    }
  }, [
    status,
    isModelsLoading,
    selectedModel,
    messages.length,
    stepCount,
    retry,
    task?.status,
    task?.error,
    taskId,
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

const TextPreviewMaxLen = 160;
const ToolInputPreviewMaxLen = 120;
const ToolOutputPreviewMaxLen = 120;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…(+${text.length - max})`;
}

/** Collapse whitespace so previews stay on a single line. */
function flattenWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Strip / collapse `<system-reminder>...</system-reminder>` blocks (and other
 * Pochi-injected wrappers) from a user-visible text snippet so logs focus on
 * what the user actually asked.
 */
function stripSystemBlocks(text: string): string {
  return text
    .replace(
      /<system-reminder>[\s\S]*?<\/system-reminder>/g,
      "<system-reminder/>",
    )
    .replace(/<environment_details>[\s\S]*?<\/environment_details>/g, "<env/>");
}

/**
 * Render a value (object / string / etc.) into a single-line preview suitable
 * for log output. JSON-encodes objects and truncates long payloads.
 */
function summarizeToolPayload(
  value: unknown,
  max = ToolInputPreviewMaxLen,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    return truncate(flattenWhitespace(value), max);
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value);
  }
  return truncate(flattenWhitespace(serialized), max);
}

/**
 * Walk the messages array and produce a flat, human-friendly summary that
 * interleaves text turns with tool-call invocations and their outputs. Useful
 * for tracing background-task behavior in logs without dumping raw message JSON.
 *
 * Returns a single string (newline-joined) so that tslog renders it as one
 * readable block rather than a JS array literal with escape sequences.
 */
function summarizeMessages(
  messages: ReadonlyArray<{
    role: string;
    parts: ReadonlyArray<Record<string, unknown>>;
  }>,
): string {
  const lines: string[] = [];
  let stepIndex = 0;
  for (const message of messages) {
    const role = message.role;
    for (const rawPart of message.parts) {
      const part = rawPart as Record<string, unknown> & { type: string };
      const type = part.type;
      if (type === "step-start") {
        stepIndex += 1;
        lines.push(`-- step ${stepIndex} --`);
        continue;
      }
      if (type === "text") {
        const raw = typeof part.text === "string" ? part.text : "";
        const cleaned = flattenWhitespace(stripSystemBlocks(raw));
        if (!cleaned) continue;
        lines.push(`[${role}] ${truncate(cleaned, TextPreviewMaxLen)}`);
        continue;
      }
      if (type === "reasoning") {
        const raw = typeof part.text === "string" ? part.text : "";
        const cleaned = flattenWhitespace(raw);
        if (!cleaned) continue;
        lines.push(
          `[${role}:reasoning] ${truncate(cleaned, TextPreviewMaxLen)}`,
        );
        continue;
      }
      if (typeof type === "string" && type.startsWith("tool-")) {
        const toolName = type.slice("tool-".length);
        const state =
          typeof part.state === "string" ? (part.state as string) : "unknown";
        const callId =
          typeof part.toolCallId === "string"
            ? (part.toolCallId as string)
            : "";
        const shortId = callId ? callId.slice(-6) : "";
        const inputPreview = summarizeToolPayload(
          part.input,
          ToolInputPreviewMaxLen,
        );
        const outputKey =
          "output" in part ? "output" : "result" in part ? "result" : undefined;
        const outputPreview = outputKey
          ? summarizeToolPayload(part[outputKey], ToolOutputPreviewMaxLen)
          : undefined;
        const header = `[${role}] ${toolName}${shortId ? `#${shortId}` : ""} (${state})`;
        const segments = [header];
        if (inputPreview) segments.push(`in=${inputPreview}`);
        if (outputPreview) segments.push(`out=${outputPreview}`);
        lines.push(segments.join(" "));
      }
    }
  }
  return lines.join("\n");
}
