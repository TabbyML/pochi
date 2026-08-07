import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { cn } from "@/lib/utils";
import type { SubAgentResultNotification } from "@getpochi/common";
import { Bot } from "lucide-react";

/**
 * Visible record of background subagent results (newTask with
 * runInBackground) delivered to the model. The LLM receives the same content
 * as a system-reminder text; this component keeps the notification visible
 * in the chat history. Each subagent renders as its own collapsible section
 * so results never blend together.
 */
export const SubagentResultsPart: React.FC<{
  results: SubAgentResultNotification[];
}> = ({ results }) => {
  if (results.length === 0) return null;

  return (
    <div className="flex flex-col">
      {results.map((result) => (
        <CollapsibleSection
          key={result.taskId}
          title={
            <>
              <Bot className="size-3.5 shrink-0" />
              <span className="truncate">
                {result.title || result.agentType || "Subagent"}
              </span>
              {result.title && result.agentType && (
                <span className="shrink-0 font-normal text-[10px] text-muted-foreground">
                  {result.agentType}
                </span>
              )}
            </>
          }
          actions={
            <span
              className={cn(
                "text-xs",
                result.status === "failed"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {result.status}
            </span>
          }
        >
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all px-3 pb-1.5 text-muted-foreground text-xs">
            {result.result}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
};
