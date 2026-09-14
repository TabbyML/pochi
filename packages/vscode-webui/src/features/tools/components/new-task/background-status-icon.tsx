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
  const { t } = useTranslation();
  const status = !task
    ? "unknown"
    : task.status === "pending-model" || task.status === "pending-tool"
      ? "running"
      : task.status === "pending-input"
        ? "waiting"
        : task.status === "failed"
          ? task.error?.kind === "AbortError"
            ? "stopped"
            : "failed"
          : "completed";
  const label =
    status === "unknown"
      ? t("backgroundTasks.statusUnavailable")
      : status === "waiting"
        ? t("backgroundTasks.waitingInput")
        : t(`backgroundTasks.${status}`);
  return (
    <StatusIcon
      tool={tool}
      isExecuting={false}
      className="flex h-5 shrink-0 items-center self-start leading-none"
      statusOverride={{ status, label }}
    />
  );
}
