import { useBackgroundTaskStatus } from "@/features/chat";
import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "../status-icon";
import type { ToolProps } from "../types";

/** Subscribes independently of the completed newTask tool call. */
export function BackgroundSubagentStatusIcon({
  taskId,
  tool,
}: {
  taskId: string;
  tool: ToolProps<"newTask">["tool"];
}) {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const jobStatus = useBackgroundTaskStatus(taskId);
  const { t } = useTranslation();
  if (!task) return <span className="h-5 w-4 shrink-0" />;
  const status = jobStatus
    ? jobStatus === "stopped"
      ? "failed"
      : jobStatus
    : task.status === "pending-model" || task.status === "pending-tool"
      ? "running"
      : task.status === "failed"
        ? "failed"
        : "completed";
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
