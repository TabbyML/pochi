import { Badge } from "@/components/ui/badge";
import { BackgroundTaskButton } from "@/features/chat";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { getToolPartError } from "@/lib/tool-call-error";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { getSubAgentTaskId } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import type { SendMessageStatus } from "@getpochi/tools";
import { useTranslation } from "react-i18next";
import { useBackgroundSubagentStatus } from "./new-task/background-status-icon";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const SendMessageTool: React.FC<ToolProps<"sendMessage">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const input = tool.input;
  const targetId = input?.taskId;
  const error = getToolPartError(tool);
  const status: SendMessageStatus | undefined =
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
    </>
  );

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        targetId || input?.message ? (
          <div
            className="flex flex-col gap-1.5 rounded-md border px-2 py-1.5"
            aria-label="subagent-message"
          >
            {targetId && <SubagentTarget targetId={targetId} />}
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
function SubagentTarget({ targetId }: { targetId: string }) {
  const { t } = useTranslation();
  const taskId = getSubAgentTaskId(targetId) ?? targetId;
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const { backgroundTaskState } = useBackgroundTaskState(taskId);
  const status = useBackgroundSubagentStatus(taskId);

  // Not a subagent of this workspace, e.g. an id the model got wrong.
  if (!task) {
    return (
      <code className="truncate bg-transparent p-0 font-mono text-muted-foreground text-xs">
        {targetId}
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
