import type { PendingToolCallApproval } from "@/features/approval";
import { useMcp } from "@/lib/hooks/use-mcp";
import { isToolAutoApproved } from "@/features/chat/lib/pending-tool-call-approval";
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
