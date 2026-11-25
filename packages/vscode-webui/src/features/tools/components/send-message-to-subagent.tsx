import { Badge } from "@/components/ui/badge";
import { BackgroundTaskButton } from "@/features/chat";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { getToolPartError } from "@/lib/tool-call-error";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { getSubAgentTaskId } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import type { SendMessageToSubagentStatus } from "@getpochi/tools";
import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useBackgroundSubagentStatus } from "./new-task/background-status-icon";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const SendMessageToSubagentTool: React.FC<
  ToolProps<"sendMessageToSubagent">
> = ({ tool, isExecuting }) => {
  const { t } = useTranslation();
  const input = tool.input;
  const backgroundJobId = input?.backgroundJobId;
  const error = getToolPartError(tool);
  const status: SendMessageToSubagentStatus | undefined =
    tool.state === "output-available" && !error
      ? tool.output?.status
      : undefined;
  const interrupt = input?.interrupt === true;

  const label = error
    ? t("toolInvocation.sendMessageToSubagentFailed")
    : status === "queued"
      ? t("toolInvocation.sentMessageToSubagentQueued")
      : status === "interrupted"
        ? t("toolInvocation.sentMessageToSubagentInterrupted")
        : status === "resumed"
          ? t("toolInvocation.sentMessageToSubagentResumed")
          : isExecuting
            ? t("toolInvocation.sendingMessageToSubagent")
            : interrupt
              ? t("toolInvocation.sendMessageToSubagentInterrupt")
              : t("toolInvocation.sendMessageToSubagent");

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">{label}</span>
      {/* A requested interrupt that found nothing to interrupt was queued. */}
      {interrupt && !error && status !== "queued" && (
        <Badge
          variant="outline"
          className="ml-2 h-5 gap-1 px-1.5 py-0 align-text-bottom font-normal text-xs"
        >
          <Zap className="size-3" aria-hidden="true" />
          {t("toolInvocation.interruptBadge")}
        </Badge>
      )}
    </>
  );

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        backgroundJobId || input?.message ? (
          <div
            className="flex flex-col gap-1.5 rounded-md border px-2 py-1.5"
            aria-label="subagent-message"
          >
            {backgroundJobId && (
              <SubagentTarget backgroundJobId={backgroundJobId} />
            )}
            {input?.message && (
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-l-2 pl-2 text-sm">
                {input.message}
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
};

/** The subagent a message goes to: its agent, title, and live status. */
function SubagentTarget({ backgroundJobId }: { backgroundJobId: string }) {
  const { t } = useTranslation();
  const taskId = getSubAgentTaskId(backgroundJobId) ?? "";
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const { backgroundTaskState } = useBackgroundTaskState(taskId);
  const status = useBackgroundSubagentStatus(taskId);

  // Not a subagent of this workspace, e.g. an id the model got wrong.
  if (!task) {
    return (
      <code className="truncate bg-transparent p-0 font-mono text-muted-foreground text-xs">
        {backgroundJobId}
      </code>
    );
  }

  const agentType = backgroundTaskState?.agentType || "Subagent";
  const title = task.title || t("backgroundTasks.untitled");
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Badge
        variant="secondary"
        className="inline-flex h-5 shrink-0 py-0 align-top"
      >
        <BackgroundTaskButton taskId={taskId}>{agentType}</BackgroundTaskButton>
      </Badge>
      <span
        className="min-w-0 flex-1 truncate text-muted-foreground"
        title={title}
      >
        {title}
      </span>
      {status && (
        <span
          className={cn(
            "shrink-0 text-xs",
            status === "failed" || status === "stopped"
              ? "text-error"
              : "text-muted-foreground",
          )}
        >
          {t(`backgroundTasks.${status}`)}
        </span>
      )}
    </div>
  );
}
