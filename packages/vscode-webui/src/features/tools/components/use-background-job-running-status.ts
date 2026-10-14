import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useTranslation } from "react-i18next";

/**
 * The `StatusIcon` override for a card that started a background job: it keeps
 * spinning while the host still lists the job, then falls back to the tool
 * call's own status.
 */
export function useBackgroundJobRunningStatus(backgroundJobId?: string) {
  const { t } = useTranslation();
  const { backgroundCommands } = useBackgroundCommands();
  if (!backgroundJobId || backgroundCommands?.[backgroundJobId] === undefined)
    return undefined;
  return { status: "running" as const, label: t("backgroundTasks.running") };
}
