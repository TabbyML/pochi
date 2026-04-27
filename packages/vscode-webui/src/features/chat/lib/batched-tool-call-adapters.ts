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
import type {
  BatchedToolCall,
  BatchedToolCallResult,
  CompiledToolPolicies,
  ToolCallCancelReason,
} from "@getpochi/tools";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import { type ToolUIPart, type UITools, getStaticToolName } from "ai";
import type { ToolCallStatusRegistry } from "./chat-state/fixed-state";
import type { ToolCallLifeCycle } from "./tool-call-life-cycle";

type ToolCall = Parameters<
  NonNullable<Parameters<typeof useLiveChatKit>[0]["onToolCall"]>
>[0]["toolCall"];

type CreateLifecycleToolCallAdapterOptions = {
  toolCall: ToolUIPart<UITools>;
  lifecycle: ToolCallLifeCycle;
  executeOptions: {
    contentType?: string[];
    builtinSubAgentInfo?: BuiltinSubAgentInfo;
    toolPolicies?: CompiledToolPolicies;
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
  toolPolicies?: CompiledToolPolicies;
  addToolOutput: ReturnType<typeof useChat>["addToolOutput"];
  toolCallStatusRegistry: ToolCallStatusRegistry;
};

type CreateAsyncAgentToolCallAdapterOptions = {
  toolCall: ToolCall;
  taskId: string;
  parentTaskId?: string;
  storeId: string;
  abortSignal: AbortSignal;
  addToolOutput: (args: {
    tool: string;
    toolCallId: string;
    output: unknown;
  }) => void;
};

/** Backed by a ToolCallLifeCycle; execution and cancellation delegate to the lifecycle. */
export function createBatchedToolCallFromLifecycle({
  toolCall,
  lifecycle,
  executeOptions,
}: CreateLifecycleToolCallAdapterOptions): BatchedToolCall {
  return {
    toolCallId: toolCall.toolCallId,
    toolName: getStaticToolName(toolCall),
    input: toolCall.input,
    run: () => {
      const toResult = (
        complete: ToolCallLifeCycle["complete"],
      ): BatchedToolCallResult => {
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

      return new Promise<BatchedToolCallResult>((resolve) => {
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
          lifecycle.execute(toolCall.input, executeOptions);
        }
      });
    },
    cancel: (reason: ToolCallCancelReason) => {
      lifecycle.abort(reason);
    },
  };
}

/** For offhand-mode sub-tasks: directly executes via vscodeHost and reports results with addToolOutput. */
export function createSubtaskBatchedToolCall({
  toolCall,
  uid,
  storeId,
  abortSignal,
  contentType,
  builtinSubAgentInfo,
  toolPolicies,
  addToolOutput,
  toolCallStatusRegistry,
}: CreateExecutorToolCallAdapterOptions): BatchedToolCall {
  return {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
    run: async () => {
      try {
        if (abortSignal.aborted) {
          throw new Error(
            getToolCallErrorMessage(abortSignal.reason as ToolCallCancelReason),
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
            toolPolicies,
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
            } satisfies BatchedToolCallResult;
          }

          return {
            kind: "success",
          } satisfies BatchedToolCallResult;
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
          } satisfies BatchedToolCallResult;
        }

        return {
          kind: "success",
        } satisfies BatchedToolCallResult;
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
    cancel: (reason: ToolCallCancelReason) => {
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

/**
 * For async-agent workers: directly executes via vscodeHost and reports
 * results with addToolOutput, with support for executeCommand streaming and
 * a parentTaskId-driven file-state cache.
 *
 * Unlike the subtask adapter, this does not depend on a UI-side
 * ToolCallStatusRegistry.
 */
export function createAsyncAgentBatchedToolCall({
  toolCall,
  taskId,
  parentTaskId,
  storeId,
  abortSignal,
  addToolOutput,
}: CreateAsyncAgentToolCallAdapterOptions): BatchedToolCall {
  return {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
    run: async () => {
      try {
        if (abortSignal.aborted) {
          throw new Error(
            getToolCallErrorMessage(abortSignal.reason as ToolCallCancelReason),
          );
        }

        const result = await vscodeHost.executeToolCall(
          toolCall.toolName,
          toolCall.input,
          {
            toolCallId: toolCall.toolCallId,
            abortSignal: ThreadAbortSignal.serialize(abortSignal),
            storeId,
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
          const executeCommandError = await new Promise<string | undefined>(
            (streamResolve) => {
              const signal = threadSignal(
                result.output as ThreadSignalSerialization<ExecuteCommandResult>,
              );

              let resolved = false;

              const finalize = (
                output: ExecuteCommandResult,
                reason: "completed" | "aborted",
              ) => {
                if (resolved) return;
                resolved = true;
                unsubscribe();
                abortSignal.removeEventListener("abort", onAbort);

                const finalResult: Record<string, unknown> = {
                  output: output.content,
                  isTruncated: output.isTruncated ?? false,
                };
                if (output.error) {
                  finalResult.error = output.error;
                } else if (reason === "aborted") {
                  finalResult.error = "Aborted by async agent worker";
                }

                addToolOutput({
                  tool: toolCall.toolName,
                  toolCallId: toolCall.toolCallId,
                  output: finalResult,
                });

                streamResolve(finalResult.error as string | undefined);
              };

              const onAbort = () => {
                finalize(signal.value, "aborted");
              };

              const unsubscribe = signal.subscribe((output) => {
                if (output.status === "completed") {
                  finalize(output, "completed");
                }
              });

              if (abortSignal.aborted) {
                finalize(signal.value, "aborted");
              } else {
                abortSignal.addEventListener("abort", onAbort);
              }
            },
          );

          if (executeCommandError) {
            return {
              kind: "error",
              error: executeCommandError,
            } satisfies BatchedToolCallResult;
          }

          return {
            kind: "success",
          } satisfies BatchedToolCallResult;
        }

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
          } satisfies BatchedToolCallResult;
        }

        return {
          kind: "success",
        } satisfies BatchedToolCallResult;
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error("Async agent batch execution failed");
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: { error: normalizedError.message },
        });
        throw normalizedError;
      }
    },
    cancel: (reason: ToolCallCancelReason) => {
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
