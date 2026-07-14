import { type ToolCallLifeCycle, useToolCallLifeCycle } from "@/features/chat";
import { getToolCallErrorMessage } from "@/lib/tool-call-error";
import type { Chat } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import type { Message, TaskStatusLike } from "@getpochi/livekit";
import {
  ResolvedAttemptTodoCompletionResult,
  type Todo,
  isTodoListResolved,
} from "@getpochi/tools";
import { isStaticToolUIPart } from "ai";
import { useEffect } from "react";

const logger = getLogger("UseAddCompleteToolCalls");
const AttemptTodoCompletionAgentName = "attemptTodoCompletion";

interface UseAddCompleteToolCallsProps {
  messages: Message[];
  enable: boolean;
  addToolOutput: Chat<Message>["addToolOutput"];
  updateTodoCompletion?: (update: TodoCompletionUpdate) => void;
}

function isToolStateCall(message: Message, toolCallId: string): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  for (const part of message.parts) {
    if (isStaticToolUIPart(part) && part.toolCallId === toolCallId) {
      return part.state === "input-available";
    }
  }

  return false;
}

export function useAddCompleteToolCalls({
  messages,
  enable,
  // setMessages,
  addToolOutput,
  updateTodoCompletion,
}: UseAddCompleteToolCallsProps): void {
  const { completeToolCalls } = useToolCallLifeCycle();

  useEffect(() => {
    if (!enable || completeToolCalls.length === 0) return;

    const lastMessage = messages.at(messages.length - 1);
    if (!lastMessage) return;

    const completedToolCalls = completeToolCalls
      .filter(
        (toolCall) =>
          toolCall.status === "complete" &&
          isToolStateCall(lastMessage, toolCall.toolCallId),
      )
      .map((toolCall) => ({
        toolCall,
        output: overrideResult(toolCall.complete),
      }));
    if (completedToolCalls.length === 0) return;

    const lastToolPart = getLastInputAvailableToolPart(lastMessage);
    const lastCompletedToolCall = completedToolCalls.find(
      ({ toolCall }) => toolCall.toolCallId === lastToolPart?.toolCallId,
    );
    let todoCompletionUpdate: TodoCompletionUpdate | undefined;
    if (lastCompletedToolCall) {
      todoCompletionUpdate = getTodoCompletionUpdate({
        message: lastMessage,
        toolCallId: lastCompletedToolCall.toolCall.toolCallId,
        output: lastCompletedToolCall.output,
      });
      if (todoCompletionUpdate) {
        updateTodoCompletion?.(todoCompletionUpdate);
      }
    }

    for (const { toolCall, output } of completedToolCalls) {
      const toolOutput =
        todoCompletionUpdate?.toolCallId === toolCall.toolCallId
          ? todoCompletionUpdate.output
          : output;
      logger.debug(
        {
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: toolOutput,
        },
        "Tool call completed",
      );
      addToolOutput({
        // @ts-expect-error
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: toolOutput,
      });
      toolCall.dispose();
    }
  }, [
    enable,
    completeToolCalls,
    messages,
    addToolOutput,
    updateTodoCompletion,
  ]);
}

function getLastInputAvailableToolPart(message: Message) {
  if (message.role !== "assistant") return undefined;

  return message.parts.findLast(
    (part) => isStaticToolUIPart(part) && part.state === "input-available",
  );
}

export type TodoCompletionUpdate = {
  toolCallId: string;
  message: Message;
  todos: Todo[];
  status: Extract<TaskStatusLike, "completed" | "pending-input">;
  output: unknown;
};

export function getTodoCompletionUpdate({
  message,
  toolCallId,
  output,
}: {
  message: Message;
  toolCallId: string;
  output: unknown;
}): TodoCompletionUpdate | undefined {
  const targetIndex = message.parts.findIndex(
    (part) =>
      part.type === "tool-newTask" &&
      part.toolCallId === toolCallId &&
      part.state === "input-available" &&
      part.input?.agentType === AttemptTodoCompletionAgentName,
  );
  if (targetIndex < 0) return undefined;

  const rawResult =
    typeof output === "object" && output !== null && "result" in output
      ? output.result
      : undefined;
  const parsedResult = ResolvedAttemptTodoCompletionResult.safeParse(rawResult);
  if (!parsedResult.success || !isTodoListResolved(parsedResult.data.todos)) {
    return undefined;
  }

  return {
    toolCallId,
    message: {
      ...message,
      parts: message.parts.map((part, index) =>
        index === targetIndex
          ? ({
              ...part,
              state: "output-available",
              output,
            } as Message["parts"][number])
          : part,
      ),
    },
    todos: parsedResult.data.todos,
    status: "completed",
    output,
  };
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}

function overrideResult(complete: ToolCallLifeCycle["complete"]) {
  const { result, reason } = complete;
  if (typeof result !== "object") {
    return result;
  }

  // biome-ignore lint/suspicious/noExplicitAny: override external result
  const output: any = {
    ...(result as object),
  };

  // Use an switch clause so new reason will be caught by type checker.
  switch (reason) {
    case "user-abort":
    case "user-reject":
    case "previous-tool-call-failed":
      output.error = getToolCallErrorMessage(reason);
      break;
    case "execute-finish":
      break;
    default:
      assertUnreachable(reason);
  }

  return output;
}
