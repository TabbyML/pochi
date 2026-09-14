import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NotificationRowClassName,
  NotificationStatusIcon,
  NotificationTypeIconClassName,
} from "@/components/ui/notification-row";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import type { SubAgentResultNotification } from "@getpochi/common";
import { Bot, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MessageMarkdown } from "./markdown";

export function SubagentResultNotificationItem({
  result,
}: { result: SubAgentResultNotification }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useDefaultStore();
  const status = result.status;
  const label = t(`backgroundTasks.${status}`);
  const title = result.title || result.agentType || "Subagent";
  return (
    <Collapsible defaultOpen>
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
        <span
          className={cn(
            NotificationTypeIconClassName,
            "pointer-events-none relative",
          )}
        >
          <Bot className="size-3" aria-hidden="true" />
        </span>
        <div className="pointer-events-none relative min-w-0 flex-1">
          <button
            type="button"
            className="pointer-events-auto block max-w-full cursor-pointer truncate rounded-sm text-left text-foreground text-xs hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() =>
              navigate({
                to: "/task",
                search: { uid: result.taskId, storeId: store.storeId },
              })
            }
          >
            {title}
          </button>
        </div>
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

export function SubagentResultsPart({
  results,
}: { results: SubAgentResultNotification[] }) {
  return results.map((result) => (
    <SubagentResultNotificationItem
      key={result.notificationId}
      result={result}
    />
  ));
}
