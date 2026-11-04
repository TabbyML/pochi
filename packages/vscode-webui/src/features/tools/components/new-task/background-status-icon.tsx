import { useBackgroundTaskStatus } from "@/features/chat";
import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "../status-icon";
import type { ToolProps } from "../types";

/**
 * Status of a background subagent, independent of the completed newTask tool
 * call. Undefined until the task is known.
 */
export function useBackgroundSubagentStatus(taskId: string) {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const jobStatus = useBackgroundTaskStatus(taskId);
  if (!task) return undefined;
  return jobStatus
    ? jobStatus === "stopped"
      ? "failed"
      : jobStatus
    : task.status === "pending-model" || task.status === "pending-tool"
      ? "running"
      : task.status === "failed"
        ? "failed"
        : "completed";
}

/** Subscribes independently of the completed newTask tool call. */
export function BackgroundSubagentStatusIcon({
  taskId,
  tool,
}: {
  taskId: string;
  tool: ToolProps<"newTask">["tool"];
}) {
  const status = useBackgroundSubagentStatus(taskId);
  const { t } = useTranslation();
  if (!status) return <span className="h-5 w-4 shrink-0" />;
  const label = t(`backgroundTasks.${status}`);
  return (
    <StatusIcon
      tool={tool}
      isExecuting={false}
      className="flex h-5 shrink-0 items-center self-start leading-none"
      statusOverride={{ status, label }}
    />
  );
}
