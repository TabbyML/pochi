import { useDefaultStore } from "@/lib/use-default-store";
import type { UseChatHelpers } from "@ai-sdk/react";
import { constants, toErrorMessage } from "@getpochi/common";
import { type Message, catalog, extractTaskResult } from "@getpochi/livekit";
import {
  Todo as TodoSchema,
  resolveAttemptTodoCompletionResult,
} from "@getpochi/tools";
import { getStaticToolName } from "ai";
import { useEffect, useMemo } from "react";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";
import type { NewTaskTool, SubtaskInfo } from "./use-subtask-info";

// Detect if subtask is completed (in subtask)
export const useShowCompleteSubtaskButton = (
  subtaskInfo: SubtaskInfo | undefined,
  messages: Message[],
) => {
  const store = useDefaultStore();
  const parentMessages = store
    .useQuery(catalog.queries.makeMessagesQuery(subtaskInfo?.parentUid ?? ""))
    .map((x) => x.data as Message);

  const isSubtaskToolCallCompleted = useMemo(() => {
    for (const message of parentMessages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-newTask" &&
          part.input?._meta?.uid === subtaskInfo?.uid
        ) {
          return part.state === "output-available";
        }
      }
    }
    return false;
  }, [parentMessages, subtaskInfo]);

  const isSubtaskCompleted = useMemo(() => {
    const lastMessage = messages.at(-1);
    if (!lastMessage) return;
    for (const part of lastMessage.parts) {
      if (
        part.type === "tool-attemptCompletion" &&
        part.state === "input-available"
      ) {
        return true;
      }
    }
  }, [messages]);

  return !!isSubtaskCompleted && !isSubtaskToolCallCompleted;
};

// Complete subtask by adding tool result (in parent task)
export const useAddSubtaskResult = ({
  messages,
}: Pick<UseChatHelpers<Message>, "messages">) => {
  const autoApproveGuard = useAutoApproveGuard();
  const store = useDefaultStore();
  const { getToolCallLifeCycle } = useToolCallLifeCycle();

  useEffect(() => {
    const toolPart = messages.at(-1)?.parts.at(-1);
    if (
      !toolPart ||
      toolPart.type !== "tool-newTask" ||
      toolPart.state !== "input-available"
    ) {
      return;
    }
    const subtaskUid = toolPart.input?._meta?.uid;
    if (!subtaskUid) return;
    const lifecycle = getToolCallLifeCycle({
      toolName: getStaticToolName(toolPart),
      toolCallId: toolPart.toolCallId,
    });
    if (lifecycle.status === "init") {
      const result = extractTaskResult(store, subtaskUid);
      if (result) {
        autoApproveGuard.current = "auto";
        lifecycle.addResult(getSubtaskToolOutput(toolPart, result));
      }
    }
  }, [autoApproveGuard, messages, getToolCallLifeCycle, store]);
};

function getSubtaskToolOutput(toolPart: NewTaskTool, result: unknown) {
  if (toolPart.input?.agentType !== constants.AttemptTodoCompletionAgentName) {
    return { result };
  }

  const todos = TodoSchema.array().safeParse(toolPart.input?._meta?.todos);
  if (!todos.success) return { result };

  try {
    return {
      result: resolveAttemptTodoCompletionResult(result, todos.data),
    };
  } catch (error) {
    return {
      error: toErrorMessage(error),
    };
  }
}
