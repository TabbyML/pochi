import type { PendingToolCallApproval } from "@/features/approval";
import { useMcp } from "@/lib/hooks/use-mcp";
import type { UITools } from "@getpochi/livekit";
import { ToolsByPermission } from "@getpochi/tools";
import { type ToolUIPart, getToolName } from "ai";
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

    if (
      autoApproveSettings.subtask &&
      ToolsByPermission.subtask.includes(toolName)
    ) {
      return true;
    }

    if (
      autoApproveSettings.mcp &&
      Object.keys(toolset).some((name) => name === toolName)
    ) {
      return true;
    }

    return false;
  };

  if ("tools" in pendingApproval) {
    return pendingApproval.tools.every(isToolApproved);
  }

  return isToolApproved(pendingApproval.tool);
}
