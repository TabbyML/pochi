import { type ToolCallLifeCycle, useToolCallLifeCycle } from "@/features/chat";
import { getToolCallErrorMessage } from "@/lib/tool-call-error";
import type { Chat } from "@ai-sdk/react";
import { getLogger } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { isStaticToolUIPart } from "ai";
import { useEffect } from "react";

const logger = getLogger("UseAddCompleteToolCalls");

interface UseAddCompleteToolCallsProps {
  messages: Message[];
  enable: boolean;
  addToolOutput: Chat<Message>["addToolOutput"];
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
        logger.debug(
          {
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            output: result,
          },
          "Tool call completed",
        );
        addToolOutput({
          // @ts-expect-error
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: result,
        });
        toolCall.dispose();
      }
    }
  }, [enable, completeToolCalls, messages, addToolOutput]);
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
