import {
  getToolCallErrorMessage,
  getToolResultError,
} from "@/lib/tool-call-error";
import { vscodeHost } from "@/lib/vscode";
import type { useChat } from "@ai-sdk/react";
import type {
  BuiltinSubAgentInfo,
  ExecuteCommandResult,
} from "@getpochi/common/vscode-webui-bridge";
import type { useLiveChatKit } from "@getpochi/livekit/react";
import type { ScheduledToolCallResult } from "@getpochi/tools";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import type {
  QueueCancelReason,
  ScheduledToolCall,
} from "./batch-execute-manager";
import type { ToolCallStatusRegistry } from "./chat-state/fixed-state";
import type { ToolCallLifeCycle } from "./tool-call-life-cycle";

type ToolCall = Parameters<
  NonNullable<Parameters<typeof useLiveChatKit>[0]["onToolCall"]>
>[0]["toolCall"];

type CreateLifecycleToolCallAdapterOptions = {
  lifecycle: ToolCallLifeCycle;
  toolName: string;
  input: unknown;
  executeOptions: {
    contentType?: string[];
    builtinSubAgentInfo?: BuiltinSubAgentInfo;
    executeCommandWhitelist?: string[];
    taskId?: string;
  };
};

type CreateExecutorToolCallAdapterOptions = {
  toolCall: ToolCall;
  uid: string;
  storeId: string;
  abortSignal: AbortSignal;
  contentType?: string[];
  builtinSubAgentInfo?: BuiltinSubAgentInfo;
  executeCommandWhitelist?: string[];
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  toolCallStatusRegistry: ToolCallStatusRegistry;
};

/** Backed by a ToolCallLifeCycle; execution and cancellation delegate to the lifecycle. */
export function createLifecycleToolCallAdapter({
  lifecycle,
  toolName,
  input,
  executeOptions,
}: CreateLifecycleToolCallAdapterOptions): ScheduledToolCall {
  return {
    toolName,
    input,
    run: () => {
      const toResult = (
        complete: ToolCallLifeCycle["complete"],
      ): ScheduledToolCallResult => {
        if (
          complete.reason === "user-abort" ||
          complete.reason === "previous-tool-call-failed"
        ) {
          return {
            kind: "cancelled",
            reason: complete.reason,
          };
        }

        const error = getToolResultError(complete.result);
        if (error) {
          return {
            kind: "error",
            error,
          };
        }

        return {
          kind: "success",
        };
      };

      if (lifecycle.status === "complete") {
        return Promise.resolve(toResult(lifecycle.complete));
      }

      if (lifecycle.status === "dispose") {
        return Promise.resolve({
          kind: "cancelled",
          reason: "user-abort",
        });
      }

      return new Promise<ScheduledToolCallResult>((resolve) => {
        const unsubComplete = lifecycle.on("complete", (state) => {
          unsubComplete();
          unsubDispose();
          const result = toResult(state);
          resolve(result);
        });

        const unsubDispose = lifecycle.on("dispose", () => {
          unsubDispose();
          unsubComplete();
          resolve({
            kind: "cancelled",
            reason: "user-abort",
          });
        });

        if (lifecycle.status === "init") {
          lifecycle.execute(input, executeOptions);
        }
      });
    },
    cancel: (reason: QueueCancelReason) => {
      lifecycle.abort(reason);
    },
  };
}

/** For offhand-mode sub-tasks: directly executes via vscodeHost and reports results with addToolOutput. */
export function createSubTaskToolCallAdapter({
  toolCall,
  uid,
  storeId,
  abortSignal,
  contentType,
  builtinSubAgentInfo,
  executeCommandWhitelist,
  addToolOutput,
  toolCallStatusRegistry,
}: CreateExecutorToolCallAdapterOptions): ScheduledToolCall {
  return {
    toolName: toolCall.toolName,
    input: toolCall.input,
    run: async () => {
      try {
        if (abortSignal.aborted) {
          throw new Error(
            getToolCallErrorMessage(abortSignal.reason as QueueCancelReason),
          );
        }

        toolCallStatusRegistry.set(toolCall, {
          isExecuting: true,
        });

        const result = await vscodeHost.executeToolCall(
          toolCall.toolName,
          toolCall.input,
          {
            toolCallId: toolCall.toolCallId,
            abortSignal: ThreadAbortSignal.serialize(abortSignal),
            contentType,
            builtinSubAgentInfo,
            executeCommandWhitelist,
            storeId,
            taskId: uid,
          },
        );

        if (
          toolCall.toolName === "executeCommand" &&
          typeof result === "object" &&
          result !== null &&
          "output" in result
        ) {
          const executeCommandError = await new Promise<string | undefined>(
            (streamResolve) => {
              const signal = threadSignal(
                result.output as ThreadSignalSerialization<ExecuteCommandResult>,
              );

              const handleOutput = (output: ExecuteCommandResult): boolean => {
                if (output.status === "completed") {
                  const toolOutput: Record<string, unknown> = {
                    output: output.content,
                    isTruncated: output.isTruncated ?? false,
                  };
                  if (output.error) {
                    toolOutput.error = output.error;
                  }
                  addToolOutput({
                    tool: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    output: toolOutput,
                  });
                  toolCallStatusRegistry.set(toolCall, {
                    isExecuting: false,
                  });
                  streamResolve(output.error);
                  return true;
                }

                toolCallStatusRegistry.set(toolCall, {
                  isExecuting: true,
                  streamingResult: {
                    toolName: "executeCommand",
                    output,
                  },
                });
                return false;
              };

              if (handleOutput(signal.value)) {
                return;
              }

              const unsubscribe = signal.subscribe((output) => {
                if (handleOutput(output)) {
                  unsubscribe();
                }
              });
            },
          );

          if (executeCommandError) {
            return {
              kind: "error",
              error: executeCommandError,
            } satisfies ScheduledToolCallResult;
          }

          return {
            kind: "success",
          } satisfies ScheduledToolCallResult;
        }

        toolCallStatusRegistry.set(toolCall, {
          isExecuting: false,
        });

        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result,
        });

        const error = getToolResultError(result);
        if (error) {
          return {
            kind: "error",
            error,
          } satisfies ScheduledToolCallResult;
        }

        return {
          kind: "success",
        } satisfies ScheduledToolCallResult;
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error("Subtask batch execution failed");
        toolCallStatusRegistry.set(toolCall, { isExecuting: false });
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { error: normalizedError.message },
        });
        throw normalizedError;
      }
    },
    cancel: (reason: QueueCancelReason) => {
      toolCallStatusRegistry.set(toolCall, { isExecuting: false });
      addToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: {
          error: getToolCallErrorMessage(reason),
        },
      });
    },
  };
}
