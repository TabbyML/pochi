import { type ToolCallLifeCycle, useToolCallLifeCycle } from "@/features/chat";
import type { Chat } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import { isToolUIPart } from "ai";
import { useEffect } from "react";

interface UseAddCompleteToolCallsProps {
  messages: Message[];
  enable: boolean;
  addToolResult: Chat<Message>["addToolResult"];
}

function isToolStateCall(message: Message, toolCallId: string): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  for (const part of message.parts) {
    if (isToolUIPart(part) && part.toolCallId === toolCallId) {
      return part.state === "input-available";
    }
  }

  return false;
}

export function useAddCompleteToolCalls({
  messages,
  enable,
  // setMessages,
  addToolResult,
}: UseAddCompleteToolCallsProps): void {
  const { completeToolCalls } = useToolCallLifeCycle();

  useEffect(() => {
    if (!enable || completeToolCalls.length === 0) return;

    const lastMessage = messages.at(messages.length - 1);
    if (!lastMessage) return;

    for (const toolCall of completeToolCalls) {
      if (toolCall.status !== "complete") continue;
      if (isToolStateCall(lastMessage, toolCall.toolCallId)) {
        const result = overrideResult(toolCall.complete);
        addToolResult({
          // @ts-expect-error
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result,
        });
        toolCall.dispose();
      }
    }
  }, [enable, completeToolCalls, messages, addToolResult]);
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
      output.error = "User aborted the tool call";
      break;
    case "user-reject":
      output.error = "User rejected the tool call";
      break;
    case "preview-reject":
    case "execute-finish":
      break;
    default:
      assertUnreachable(reason);
  }

  return output;
}
