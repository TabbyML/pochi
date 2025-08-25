import { vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import { type Message, type Task, catalog } from "@getpochi/livekit";
import type { ClientTools } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import type { InferToolInput, ToolUIPart } from "ai";
import Emittery from "emittery";
import type { ToolCallLifeCycleKey } from "./chat-state/types";

type PreviewReturnType = { error: string } | undefined;
type ExecuteCommandReturnType = {
  output: ThreadSignalSerialization<ExecuteCommandResult>;
  detach: () => void;
};
type NewTaskParameterType = InferToolInput<ClientTools["newTask"]>;
type NewTaskReturnType = {
  uid: string;
};
type ExecuteReturnType = ExecuteCommandReturnType | NewTaskReturnType | unknown;

type StreamingResult =
  | {
      toolName: "executeCommand";
      output: ExecuteCommandResult;
      detach: () => void;
    }
  | {
      // Not actually a task streaming result, but we provide context here for the live-sub-task.
      toolName: "newTask";
      abortSignal: AbortSignal;
      throws: (error: string) => void;
    };

type CompleteReason =
  | "execute-finish"
  | "user-reject"
  | "preview-reject"
  | "user-detach"
  | "user-abort";

type AbortFunctionType = AbortController["abort"];

type ToolCallState =
  | {
      // Represents preview runs at toolCall.state === "partial-call"
      type: "init";
      previewJob: Promise<PreviewReturnType>;
      abort: AbortFunctionType;
    }
  | {
      // Represents the preview runs at toolCall.state === "call"
      type: "pending";
      previewJob: Promise<PreviewReturnType>;
      abort: AbortFunctionType;
      abortSignal: AbortSignal;
    }
  | {
      type: "ready";
      abort: AbortFunctionType;
      abortSignal: AbortSignal;
    }
  | {
      type: "execute";
      executeJob: Promise<ExecuteReturnType>;
      abort: AbortFunctionType;
      abortSignal: AbortSignal;
    }
  | {
      type: "execute:streaming";
      streamingResult: StreamingResult;
      abort: AbortFunctionType;
      abortSignal: AbortSignal;
    }
  | {
      type: "complete";
      result: unknown;
      reason: CompleteReason;
    }
  | {
      type: "dispose";
    };

type ToolCallLifeCycleEvents = {
  [K in ToolCallState["type"]]: Extract<ToolCallState, { type: K }>;
};

export interface ToolCallLifeCycle {
  readonly toolName: string;
  readonly toolCallId: string;

  readonly status: ToolCallState["type"];

  /**
   * Streaming result data if available.
   * Returns undefined if not in streaming state.
   */
  readonly streamingResult: StreamingResult | undefined;

  /**
   * Completion result and reason.
   * Should only be accessed when the lifecycle is in complete state.
   */
  readonly complete: {
    result: unknown;
    reason: CompleteReason;
  };

  dispose(): void;

  /**
   * Preview the tool call with given arguments and state.
   * @param args - Tool call arguments
   * @param state - Current tool invocation state
   */
  preview(args: unknown, state: ToolUIPart["state"]): void;

  /**
   * Execute the tool call with given arguments and options.
   * @param args - Tool call arguments
   * @param options - Execution options including model selection
   */
  execute(args: unknown, options: { model?: string }): void;

  /**
   * Abort the currently executing tool call.
   */
  abort(): void;

  /**
   * Reject the tool call, preventing execution.
   */
  reject(): void;
}

const logger = getLogger("ToolCallLifeCycle");

export class ManagedToolCallLifeCycle
  extends Emittery<ToolCallLifeCycleEvents>
  implements ToolCallLifeCycle
{
  private state: ToolCallState;
  private readonly outerAbortController: AbortController;
  readonly toolName: string;
  readonly toolCallId: string;

  constructor(
    private readonly store: Store,
    key: ToolCallLifeCycleKey,
    abortController: AbortController,
  ) {
    super();
    this.toolName = key.toolName;
    this.toolCallId = key.toolCallId;
    this.outerAbortController = abortController;
    this.state = {
      type: "init",
      previewJob: Promise.resolve(undefined),
      abort: () => this.outerAbortController.abort(),
    };
  }

  get status() {
    return this.state.type;
  }

  get streamingResult() {
    return this.state.type === "execute:streaming"
      ? this.state.streamingResult
      : undefined;
  }

  get complete() {
    const complete = this.checkState("Result", "complete");
    return {
      result: complete.result,
      reason: complete.reason,
    };
  }

  dispose() {
    this.transitTo("complete", { type: "dispose" });
  }

  preview(args: unknown, state: ToolUIPart["state"]) {
    if (this.status === "ready") {
      this.previewReady(args, state);
    } else {
      this.previewInit(args, state);
    }
  }

  private previewReady(args: unknown, state: ToolUIPart["state"]) {
    const { abortSignal } = this.checkState("Preview", "ready");
    vscodeHost.previewToolCall(this.toolName, args, {
      state: convertState(state),
      toolCallId: this.toolCallId,
      abortSignal: ThreadAbortSignal.serialize(abortSignal),
    });
  }

  private previewInit(args: unknown, state: ToolUIPart["state"]) {
    let { previewJob } = this.checkState("Preview", "init");
    const previewToolCall = (abortSignal: AbortSignal) =>
      vscodeHost.previewToolCall(this.toolName, args, {
        state: convertState(state),
        toolCallId: this.toolCallId,
        abortSignal: ThreadAbortSignal.serialize(abortSignal),
      });

    if (state === "input-streaming") {
      previewJob = previewJob.then(() =>
        previewToolCall(this.outerAbortController.signal),
      );
      this.transitTo("init", {
        type: "init",
        previewJob,
        abort: () => this.outerAbortController.abort(),
      });
    } else if (state === "input-available") {
      const abortController = new AbortController();
      const abortSignal = AbortSignal.any([
        abortController.signal,
        this.outerAbortController.signal,
      ]);
      previewJob = previewJob.then(() => previewToolCall(abortSignal));
      previewJob.then((result) => {
        if (result?.error) {
          logger.debug("Tool call preview rejected:", result.error);
          this.transitTo("pending", {
            type: "complete",
            result,
            reason: "preview-reject",
          });
        } else {
          this.transitTo("pending", {
            type: "ready",
            abort: (reason) => abortController.abort(reason),
            abortSignal,
          });
        }
      });
      this.transitTo("init", {
        type: "pending",
        previewJob,
        abort: (reason) => abortController.abort(reason),
        abortSignal,
      });
    }
  }

  execute(args: unknown) {
    const abortController = new AbortController();
    const abortSignal = AbortSignal.any([
      abortController.signal,
      this.outerAbortController.signal,
    ]);
    let executePromise: Promise<unknown>;

    if (this.toolName === "newTask") {
      executePromise = this.runNewTask(args as NewTaskParameterType);
    } else {
      executePromise = vscodeHost.executeToolCall(this.toolName, args, {
        toolCallId: this.toolCallId,
        abortSignal: ThreadAbortSignal.serialize(abortSignal),
      });
    }

    const executeJob = executePromise
      .catch((err) => ({
        error: `Failed to execute tool: ${err.message}`,
      }))
      .then((result) => {
        this.onExecuteDone(result);
      });

    this.transitTo("ready", {
      type: "execute",
      executeJob,
      abort: (reason) => abortController.abort(reason),
      abortSignal,
    });
  }

  private runNewTask(args: NewTaskParameterType): Promise<NewTaskReturnType> {
    const uid = args._meta?.uid;
    if (!uid) {
      throw new Error("Missing uid in newTask arguments");
    }

    return Promise.resolve({ uid });
  }

  abort() {
    if (
      this.state.type === "init" ||
      this.state.type === "pending" ||
      this.state.type === "execute" ||
      this.state.type === "execute:streaming"
    ) {
      this.state.abort("user-abort");
      this.transitTo(["init", "pending"], {
        type: "complete",
        result: { error: "Tool call aborted by user." },
        reason: "user-abort",
      });
    }
  }

  reject() {
    const { abort } = this.checkState("Reject", "ready");
    abort();
    this.transitTo("ready", {
      type: "complete",
      result: {
        error:
          "User rejected the tool call, please use askFollowupQuestion to clarify next step with user.",
      },
      reason: "user-reject",
    });
  }

  private onExecuteDone(result: ExecuteReturnType) {
    const { abortSignal } = this.checkState("onExecuteDone", "execute");
    if (
      this.toolName === "executeCommand" &&
      typeof result === "object" &&
      result !== null &&
      "output" in result
    ) {
      this.onExecuteCommand(result as ExecuteCommandReturnType);
    } else if (this.toolName === "newTask") {
      this.onExecuteNewTask(result as NewTaskReturnType);
    } else {
      this.transitTo("execute", {
        type: "complete",
        result,
        reason: abortSignal.aborted ? "user-abort" : "execute-finish",
      });
    }
  }

  private onExecuteCommand(result: ExecuteCommandReturnType) {
    const signal = threadSignal(result.output);
    const { abort, abortSignal } = this.checkState("Streaming", "execute");

    let isUserDetached = false;

    const detach = () => {
      isUserDetached = true;
      result.detach();
      abort();
    };

    this.transitTo("execute", {
      type: "execute:streaming",
      streamingResult: {
        toolName: "executeCommand",
        output: signal.value,
        detach,
      },
      abort,
      abortSignal,
    });

    const unsubscribe = signal.subscribe((output) => {
      if (output.status === "completed") {
        const result: Record<string, unknown> = {
          output: output.content,
          isTruncated: output.isTruncated ?? false,
        };
        // do not set error property if it is undefined
        if (output.error) {
          result.error = output.error;
        }
        this.transitTo("execute:streaming", {
          type: "complete",
          result,
          reason: isUserDetached
            ? "user-detach"
            : abortSignal.aborted
              ? "user-abort"
              : "execute-finish",
        });
        unsubscribe();
      } else {
        this.transitTo("execute:streaming", {
          type: "execute:streaming",
          streamingResult: {
            toolName: "executeCommand",
            output,
            detach,
          },
          abort,
          abortSignal,
        });
      }
    });
  }

  private onExecuteNewTask({ uid }: NewTaskReturnType) {
    const cleanupFns: (() => void)[] = [];
    const cleanup = () => {
      for (const fn of cleanupFns) {
        fn();
      }
    };

    const { abort, abortSignal } = this.checkState(
      "onExecuteNewTask",
      "execute",
    );
    this.transitTo("execute", {
      type: "execute:streaming",
      streamingResult: {
        toolName: "newTask",
        abortSignal,
        throws: (error: string) => {
          this.transitTo("execute:streaming", {
            type: "complete",
            result: {
              error,
            },
            reason: "execute-finish",
          });
          cleanup();
        },
      },
      abort,
      abortSignal,
    });

    const onAbort = () => {
      this.transitTo("execute:streaming", {
        type: "complete",
        result: {
          error: abortSignal.reason,
        },
        reason: "user-abort",
      });
      cleanup();
    };
    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener("abort", onAbort, { once: true });
      cleanupFns.push(() => {
        abortSignal.removeEventListener("abort", onAbort);
      });
    }

    const onTaskUpdate = (task: Task | undefined) => {
      if (task?.status === "completed") {
        const result = {
          result: extractCompletionResult(this.store, uid),
        };
        this.transitTo("execute:streaming", {
          type: "complete",
          result,
          reason: "execute-finish",
        });

        cleanup();
      }
    };

    const unsubscribe = this.store.subscribe(
      catalog.queries.makeTaskQuery(uid),
      {
        onSubscribe: (query) =>
          setTimeout(() => onTaskUpdate(this.store.query(query)), 1), // setTimeout to ensure we call onTaskUpdate after the subscription is established
        onUpdate: (task) => onTaskUpdate(task),
      },
    );
    cleanupFns.push(unsubscribe);
  }

  private checkState<T extends ToolCallState["type"]>(
    op: string,
    expectedState: T,
  ): Extract<ToolCallState, { type: T }> {
    if (this.state.type !== expectedState) {
      throw new Error(
        `[${this.toolName}:${this.toolCallId}] ${op} is not allowed in ${this.state.type}, expects ${expectedState}`,
      );
    }

    return this.state as Extract<ToolCallState, { type: T }>;
  }

  private transitTo(
    expectedState: ToolCallState["type"] | ToolCallState["type"][],
    newState: ToolCallState,
  ): void {
    const expectedStates = Array.isArray(expectedState)
      ? expectedState
      : [expectedState];

    if (!expectedStates.includes(this.state.type)) {
      throw new Error(
        `[${this.toolName}:${this.toolCallId}] failed to transit to ${newState.type}, expects ${expectedState}, but in ${this.state.type}`,
      );
    }

    this.state = newState;

    logger.debug(
      `${this.toolName}:${this.toolCallId} transitioned to ${newState.type}`,
    );
    this.emit(this.state.type, this.state);
  }
}

function convertState(state: ToolUIPart["state"]) {
  if (state === "input-streaming") {
    return "partial-call";
  }

  if (state === "input-available") {
    return "call";
  }

  return "result";
}

function extractCompletionResult(store: Store, uid: string) {
  const lastMessage = store
    .query(catalog.queries.makeMessagesQuery(uid))
    .map((x) => x.data as Message)
    .at(-1);
  if (!lastMessage) {
    throw new Error(`No message found for uid ${uid}`);
  }

  const lastStepStart = lastMessage.parts.findLastIndex(
    (x) => x.type === "step-start",
  );

  for (const part of lastMessage.parts.slice(lastStepStart + 1)) {
    if (
      part.type === "tool-attemptCompletion" &&
      (part.state === "input-available" || part.state === "output-available")
    ) {
      return part.input.result;
    }

    if (
      part.type === "tool-askFollowupQuestion" &&
      (part.state === "input-available" || part.state === "output-available")
    ) {
      return part.input.question;
    }
  }
}
