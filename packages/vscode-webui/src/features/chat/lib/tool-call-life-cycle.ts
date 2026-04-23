import { blobStore } from "@/lib/remote-blob-store";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import type {
  BuiltinSubAgentInfo,
  ExecuteCommandResult,
} from "@getpochi/common/vscode-webui-bridge";
import {
  type LiveKitStore,
  type Task,
  catalog,
  extractTaskResult,
  processContentOutput,
} from "@getpochi/livekit";

import type { ClientTools } from "@getpochi/tools";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import type { InferToolInput } from "ai";
import Emittery from "emittery";
import type { ToolCallLifeCycleKey } from "./chat-state/types";

type ExecuteCommandReturnType = {
  output: ThreadSignalSerialization<ExecuteCommandResult>;
  detach: () => void;
};
type NewTaskParameterType = InferToolInput<ClientTools["newTask"]>;
type NewTaskReturnType = {
  result: string;
  runAsync: boolean;
};
type ExecuteReturnType = ExecuteCommandReturnType | NewTaskReturnType | unknown;

export type StreamingResult =
  | {
      toolName: "executeCommand";
      output: ExecuteCommandResult;
    }
  | {
      // Not actually a task streaming result, but we provide context here for the live-sub-task.
      toolName: "newTask";
      abortSignal: AbortSignal;
      throws: (error: string) => void;
    };

export type CompleteReason =
  | "execute-finish"
  | "user-reject"
  | "user-abort"
  | "previous-tool-call-failed";

type AbortReason = Extract<
  CompleteReason,
  "user-abort" | "previous-tool-call-failed"
>;

type AbortFunctionType = AbortController["abort"];

type ToolCallState =
  | {
      // Represent a fresh state that hasn't been used.
      type: "init";
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

export type ToolCallLifeCycleEvents = {
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
   * Execute the tool call with given arguments and options.
   * @param args - Tool call arguments
   * @param options - Execution options including model selection and taskId
   */
  execute(
    args: unknown,
    options?: {
      contentType?: string[];
      builtinSubAgentInfo?: BuiltinSubAgentInfo;
      executeCommandWhitelist?: string[];
      taskId?: string;
    },
  ): void;

  /**
   * Abort the currently executing tool call.
   */
  abort(reason?: AbortReason, result?: unknown): void;

  /**
   * Reject the tool call, preventing execution.
   */
  reject(): void;

  /**
   * Subscribe to lifecycle state transition events.
   * Returns an unsubscribe function.
   */
  on<K extends keyof ToolCallLifeCycleEvents>(
    eventName: K,
    listener: (eventData: ToolCallLifeCycleEvents[K]) => void,
  ): () => void;

  addResult(result: unknown): void;
}

const logger = getLogger("ToolCallLifeCycle");

export class ManagedToolCallLifeCycle
  extends Emittery<ToolCallLifeCycleEvents>
  implements ToolCallLifeCycle
{
  private state: ToolCallState;
  readonly toolName: string;
  readonly toolCallId: string;

  constructor(
    private readonly store: LiveKitStore,
    key: ToolCallLifeCycleKey,
    private readonly outerAbortSignal: AbortSignal,
  ) {
    super();
    this.toolName = key.toolName;
    this.toolCallId = key.toolCallId;
    this.state = { type: "init" };
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

  execute(
    args: unknown,
    options?: {
      contentType?: string[];
      builtinSubAgentInfo?: BuiltinSubAgentInfo;
      executeCommandWhitelist?: string[];
      taskId?: string;
    },
  ) {
    const abortController = new AbortController();
    const abortSignal = AbortSignal.any([
      abortController.signal,
      this.outerAbortSignal,
    ]);
    let executePromise: Promise<unknown>;

    if (this.toolName === "newTask") {
      executePromise = this.runNewTask(args as NewTaskParameterType);
    } else {
      executePromise = vscodeHost.executeToolCall(this.toolName, args, {
        toolCallId: this.toolCallId,
        abortSignal: ThreadAbortSignal.serialize(abortSignal),
        contentType: options?.contentType,
        builtinSubAgentInfo: options?.builtinSubAgentInfo,
        executeCommandWhitelist: options?.executeCommandWhitelist,
        storeId: this.store.storeId,
        taskId: options?.taskId ?? "",
      });
    }

    const executeJob = executePromise
      .catch((err) => ({
        error: `Failed to execute tool: ${err.message}`,
      }))
      .then((result) => processContentOutput(blobStore, result, abortSignal))

      .then((result) => {
        this.onExecuteDone(result);
      });

    this.transitTo("init", {
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

    const runAsync = !!args.runAsync;
    if (runAsync && isVSCodeEnvironment()) {
      const cwd = window.POCHI_TASK_INFO?.cwd;
      if (cwd) {
        void vscodeHost.openTaskInPanel(
          {
            type: "open-task",
            uid,
            cwd,
            storeId: this.store.storeId,
          },
          { preserveFocus: true, preview: false },
        );
      }
    }

    return Promise.resolve({ result: uid, runAsync });
  }

  addResult(result: unknown): void {
    this.transitTo("init", {
      type: "complete",
      result,
      reason: "execute-finish",
    });
  }

  abort(reason: AbortReason = "user-abort", result: unknown = {}) {
    if (this.state.type === "init") {
      this.transitTo("init", {
        type: "complete",
        result,
        reason,
      });
      return;
    }

    if (
      this.state.type === "execute" ||
      this.state.type === "execute:streaming"
    ) {
      this.state.abort(reason);
      this.transitTo(["execute", "execute:streaming"], {
        type: "complete",
        result,
        reason,
      });
    }
  }

  reject() {
    this.transitTo("init", {
      type: "complete",
      result: {},
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

    this.transitTo("execute", {
      type: "execute:streaming",
      streamingResult: {
        toolName: "executeCommand",
        output: signal.value,
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
          reason: abortSignal.aborted ? "user-abort" : "execute-finish",
        });
        unsubscribe();
      } else {
        this.transitTo("execute:streaming", {
          type: "execute:streaming",
          streamingResult: {
            toolName: "executeCommand",
            output,
          },
          abort,
          abortSignal,
        });
      }
    });
  }

  private onExecuteNewTask({ result, runAsync }: NewTaskReturnType) {
    const uid = result;
    if (!uid) {
      throw new Error("Missing uid in newTask result");
    }

    if (runAsync) {
      this.transitTo("execute", {
        type: "complete",
        result: {
          result: uid,
        },
        reason: "execute-finish",
      });
      return;
    }

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
        toolName: this.toolName as "newTask",
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
      if (
        task?.status === "completed" &&
        this.state.type === "execute:streaming"
      ) {
        const result = {
          result: extractTaskResult(this.store, uid),
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
      (task) => onTaskUpdate(task),
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
