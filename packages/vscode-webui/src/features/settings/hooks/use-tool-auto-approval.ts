import type { PendingToolCallApproval } from "@/features/approval";
import { useMcp } from "@/lib/hooks/use-mcp";
import type { McpStatus } from "@getpochi/common/mcp-utils";
import type { Message } from "@getpochi/livekit";
import {
  type ToolName,
  ToolsByPermission,
  isUserInputToolPart,
} from "@getpochi/tools";
import { type ToolUIPart, type UITools, getToolName, isToolUIPart } from "ai";
import type { AutoApprove } from "../store";
import { useAutoApprove } from "./use-auto-approve";

export function useToolAutoApproval(
  pendingApproval: PendingToolCallApproval,
  autoApproveGuard: boolean,
  isSubTask: boolean,
): boolean {
  const { autoApproveActive, autoApproveSettings } = useAutoApprove({
    autoApproveGuard,
    isSubTask,
  });
  const { toolset } = useMcp();

  return isToolAutoApproved({
    autoApproveActive,
    autoApproveSettings,
    toolset,
    pendingApproval,
  });
}

export const getPendingToolcallApproval = (
  message: Message,
): PendingToolCallApproval | undefined => {
  if (message.role !== "assistant") {
    return;
  }
  const tools = [];
  for (const part of message.parts) {
    if (
      isToolUIPart(part) &&
      part.state === "input-available" &&
      !isUserInputToolPart(part)
    ) {
      tools.push(part);
    }
  }

  if (tools.length === 1) {
    return {
      name: getToolName(tools[0]) as ToolName,
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
};

export const isToolAutoApproved = ({
  autoApproveActive,
  autoApproveSettings,
  toolset,
  pendingApproval,
}: {
  autoApproveActive: boolean;
  autoApproveSettings: AutoApprove;
  toolset: McpStatus["toolset"];
  pendingApproval: PendingToolCallApproval;
}) => {
  const isToolApproved = (tool: ToolUIPart<UITools>) => {
    const toolName = getToolName(tool);
    if (ToolsByPermission.default.includes(toolName)) {
      return true;
    }

    if (!autoApproveActive) {
      return false;
    }

    if (autoApproveSettings.read && ToolsByPermission.read.includes(toolName)) {
      return true;
    }

    if (
      autoApproveSettings.write &&
      ToolsByPermission.write.includes(toolName)
    ) {
      return true;
    }

    if (
      autoApproveSettings.execute &&
      ToolsByPermission.execute.includes(toolName)
    ) {
      return true;
    }

    // Check if it's an MCP tool
    if (Object.keys(toolset).some((name) => name === toolName)) {
      // First check if global MCP approval is enabled
      if (!autoApproveSettings.mcp) {
        return false;
      }

      // Check if any server has this tool approved
      for (const [, serverConfig] of Object.entries(
        autoApproveSettings.mcpServers ?? {},
      )) {
        if (serverConfig.tools.includes(toolName)) {
          return true;
        }
      }

      // If no specific approval found, deny
      return false;
    }

    return false;
  };

  if ("tools" in pendingApproval) {
    return pendingApproval.tools.every(isToolApproved);
  }

  return isToolApproved(pendingApproval.tool);
};
