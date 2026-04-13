import type { Message, UITools } from "@getpochi/livekit";
import type { ToolName } from "@getpochi/tools";
import { isUserInputToolPart } from "@getpochi/tools";
import { type ToolUIPart, getStaticToolName, isStaticToolUIPart } from "ai";
import { useMemo } from "react";

export type PendingToolCallApproval =
  | {
      name: ToolName;
      tool: ToolUIPart<UITools>;
    }
  | {
      name: "batchCall";
      tools: ToolUIPart<UITools>[];
    };

export function usePendingToolCallApproval({
  error,
  messages,
}: { error?: Error; messages: Message[] }) {
  const pendingApproval = useMemo((): PendingToolCallApproval | undefined => {
    if (error) {
      return undefined;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== "assistant") {
      return undefined;
    }

    const tools = [];
    for (const part of lastMessage.parts) {
      if (
        isStaticToolUIPart(part) &&
        part.state === "input-available" &&
        !isUserInputToolPart(part)
      ) {
        tools.push(part);
      }
    }

    if (tools.length === 1) {
      return {
        name: getStaticToolName(tools[0]) as ToolName,
        tool: tools[0],
      };
    }

    if (tools.length > 1) {
      return {
        name: "batchCall",
        tools: tools,
      };
    }
    return undefined;
  }, [error, messages]);

  return { pendingApproval };
}
