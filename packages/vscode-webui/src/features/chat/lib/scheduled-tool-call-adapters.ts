import { getToolResultError } from "@/lib/tool-call-error";
import { vscodeHost } from "@/lib/vscode";
import type { useChat } from "@ai-sdk/react";
import type {
  BuiltinSubAgentInfo,
  ExecuteCommandResult,
} from "@getpochi/common/vscode-webui-bridge";
import type { useLiveChatKit } from "@getpochi/livekit/react";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import type { ToolCallStatusRegistry } from "./chat-state/fixed-state";
import type {
  QueueCancelReason,
  ScheduledToolCall,
  ScheduledToolCallResult,
} from "./scheduled-tool-call";
import type { ToolCallLifeCycle } from "./tool-call-life-cycle";

type ToolCall = Parameters<
  NonNullable<Parameters<typeof useLiveChatKit>[0]["onToolCall"]>
>[0]["toolCall"];

type CreateLifecycleToolCallAdapterOptions = {
  lifecycle: ToolCallLifeCycle;
  toolName: string;
  input: unknown;
  executeArgs: unknown;
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
  resolve: () => void;
  reject: (error: Error) => void;
};

export function createLifecycleToolCallAdapter({
  lifecycle,
  toolName,
  input,
  executeArgs,
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
          complete.reason === "user-reject" ||
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
          kind: "error",
          error: "Tool call lifecycle disposed",
        });
      }

      return new Promise<ScheduledToolCallResult>((resolve) => {
        const unsubComplete = lifecycle.on("complete", (state) => {
          unsubComplete();
          unsubDispose();
          resolve(toResult(state));
        });

        const unsubDispose = lifecycle.on("dispose", () => {
          unsubDispose();
          unsubComplete();
          resolve({
            kind: "error",
            error: "Tool call lifecycle disposed",
          });
        });

        if (lifecycle.status === "init") {
          lifecycle.execute(executeArgs, executeOptions);
        }
      });
    },
    cancel: (reason: QueueCancelReason) => {
      if (reason === "user-abort") {
        lifecycle.abort();
        return;
      }

      lifecycle.abort("previous-tool-call-failed");
    },
  };
}

export function createExecutorToolCallAdapter({
  toolCall,
  uid,
  storeId,
  abortSignal,
  contentType,
  builtinSubAgentInfo,
  executeCommandWhitelist,
  addToolOutput,
  toolCallStatusRegistry,
  resolve,
  reject,
}: CreateExecutorToolCallAdapterOptions): ScheduledToolCall {
  return {
    toolName: toolCall.toolName,
    input: toolCall.input,
    run: async () => {
      try {
        if (abortSignal.aborted) {
          throw new Error("Subtask batch queue aborted");
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

          resolve();
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

        resolve();
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
        reject(normalizedError);
        throw normalizedError;
      }
    },
    cancel: (_reason: QueueCancelReason) => {
      reject(new Error("Subtask batch queue aborted"));
    },
  };
}
