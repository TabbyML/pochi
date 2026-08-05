import { CollapsibleSection } from "@/components/ui/collapsible-section";
import type { MonitorEventBatch } from "@getpochi/common";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Visible record of monitor events (startMonitor tool) delivered to the
 * model. The LLM receives the same content as a system-reminder text; this
 * component keeps the event visible in the chat history.
 */
export const MonitorEventsPart: React.FC<{
  batches: MonitorEventBatch[];
}> = ({ batches }) => {
  const { t } = useTranslation();

  if (batches.length === 0) return null;
  const description = batches[0].description;
  const lines = batches.flatMap((batch) => {
    const rendered = [...batch.lines];
    if (batch.ended) {
      rendered.push(`[monitor ended: ${batch.ended.reason}]`);
    }
    return rendered;
  });

  return (
    <CollapsibleSection
      title={
        <>
          <Activity className="size-3.5 shrink-0" />
          <span className="truncate">{description}</span>
        </>
      }
      actions={
        <span className="text-muted-foreground text-xs">
          {t("monitorEvents.eventCount", { count: lines.length })}
        </span>
      }
    >
      <div className="max-h-40 overflow-y-auto px-3 pb-1.5 font-mono text-muted-foreground text-xs">
        {lines.map((line, i) => (
          <div key={`${i}-${line}`} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
};
