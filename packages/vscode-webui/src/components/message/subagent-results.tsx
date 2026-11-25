import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NotificationRowClassName,
  NotificationStatusIcon,
} from "@/components/ui/notification-row";
import { BackgroundTaskButton } from "@/features/chat";
import { cn } from "@/lib/utils";
import type { BackgroundSubagentNotification } from "@getpochi/common";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MessageMarkdown } from "./markdown";

export function SubagentResultNotificationItem({
  result,
}: { result: BackgroundSubagentNotification }) {
  const { t } = useTranslation();
  const status = result.status;
  const label = t(`backgroundTasks.${status}`);
  const agentType = result.agentType || "Subagent";
  const title = result.title;
  return (
    <Collapsible>
      <div className={cn(NotificationRowClassName, "relative")}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={t("backgroundTasks.toggleResult")}
            className="group/toggle absolute inset-0 flex cursor-pointer items-center justify-end rounded-sm pr-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="flex size-5 items-center justify-center">
              <ChevronLeft
                className="group-aria-expanded/toggle:-rotate-90 size-3.5 text-muted-foreground transition-transform"
                aria-hidden="true"
              />
            </span>
          </button>
        </CollapsibleTrigger>
        <Badge
          variant="secondary"
          className="relative inline-flex h-5 shrink-0 py-0 align-top"
        >
          <BackgroundTaskButton taskId={result.taskId}>
            {agentType}
          </BackgroundTaskButton>
        </Badge>
        <span
          className="pointer-events-none relative min-w-0 flex-1 truncate text-muted-foreground leading-5"
          title={title}
        >
          {title}
        </span>
        <span className="pointer-events-none relative flex shrink-0">
          <NotificationStatusIcon status={status} label={label} />
        </span>
        <span
          className="pointer-events-none size-5 shrink-0"
          aria-hidden="true"
        />
      </div>
      <CollapsibleContent>
        <div className="max-h-80 overflow-y-auto px-1 pt-1 pb-2">
          <MessageMarkdown>{result.result}</MessageMarkdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
