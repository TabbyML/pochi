import { type ToolCallLifeCycle, useToolCallLifeCycle } from "@/features/chat";
import { getToolCallErrorMessage } from "@/lib/tool-call-error";
import { useDefaultStore } from "@/lib/use-default-store";
import type { Chat } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import { type Message, type TaskStatusLike, catalog } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { isStaticToolUIPart } from "ai";
import type { RefObject } from "react";
import { useEffect } from "react";
import { z } from "zod";

const logger = getLogger("UseAddCompleteToolCalls");
const AttemptTodoCompletionAgentName = "attemptTodoCompletion";

interface UseAddCompleteToolCallsProps {
  messages: Message[];
  enable: boolean;
  addToolOutput: Chat<Message>["addToolOutput"];
  taskId?: string;
  todos?: readonly Todo[];
  todosRef?: RefObject<Todo[] | undefined>;
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
  taskId,
  todos,
  todosRef,
}: UseAddCompleteToolCallsProps): void {
  const { completeToolCalls } = useToolCallLifeCycle();
  const store = useDefaultStore();

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
    const todoCompletionUpdate =
      lastCompletedToolCall && taskId && todos
        ? getTodoCompletionUpdate({
            message: lastMessage,
            toolCallId: lastCompletedToolCall.toolCall.toolCallId,
            output: lastCompletedToolCall.output,
            todos,
          })
        : undefined;
    if (todoCompletionUpdate && taskId) {
      if (todosRef) {
        todosRef.current = todoCompletionUpdate.todos;
      }
      store.commit(
        catalog.events.attemptTodoCompletionFinished({
          id: taskId,
          data: todoCompletionUpdate.message,
          todos: todoCompletionUpdate.todos,
          status: todoCompletionUpdate.status,
          updatedAt: new Date(),
        }),
      );
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
    taskId,
    todos,
    todosRef,
    store,
  ]);
}

function getLastInputAvailableToolPart(message: Message) {
  if (message.role !== "assistant") return undefined;

  return message.parts.findLast(
    (part) => isStaticToolUIPart(part) && part.state === "input-available",
  );
}

type TodoCompletionUpdate = {
  toolCallId: string;
  message: Message;
  todos: Todo[];
  status: Extract<TaskStatusLike, "completed" | "pending-input">;
  output: unknown;
};

const attemptTodoCompletionOutputSchema = z.object({
  success: z
    .boolean()
    .describe(
      "Whether automatic todo continuation should stop after this audit.",
    ),
  summary: z.string().describe("A concise summary of the todo audit result."),
  todoUpdates: z
    .array(
      z.object({
        id: z.string().optional(),
        status: z.enum(["in-progress", "completed", "cancelled"]),
      }),
    )
    .describe("Status update for the active todo."),
});

export function getTodoCompletionUpdate({
  message,
  toolCallId,
  output,
  todos,
}: {
  message: Message;
  toolCallId: string;
  output: unknown;
  todos: readonly Todo[];
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
  const parsed = attemptTodoCompletionOutputSchema.safeParse(
    parseJsonString(rawResult),
  );
  if (!parsed.success) return undefined;

  const result = parsed.data;
  if (!result.success) return undefined;
  const update = result.todoUpdates.at(0);
  if (!update) return undefined;

  const nextTodos = applyTodoUpdates(todos, update.status);
  if (hasSameTodoStatuses(todos, nextTodos)) return undefined;

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
    todos: nextTodos,
    status: "completed",
    output,
  };
}

function hasSameTodoStatuses(
  previousTodos: readonly Todo[],
  nextTodos: readonly Todo[],
): boolean {
  return previousTodos.every(
    (todo, index) => todo.status === nextTodos[index]?.status,
  );
}

function applyTodoUpdates(
  todos: readonly Todo[],
  status: Todo["status"],
): Todo[] {
  const [todo, ...rest] = todos;
  if (!todo) return [];
  return [{ ...todo, status }, ...rest];
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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
