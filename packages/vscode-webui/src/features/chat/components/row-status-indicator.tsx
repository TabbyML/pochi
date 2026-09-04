/** The status marker shared by every manage-panel row. */
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type RowStatusTone = "success" | "danger" | "warning" | "muted";

export function RowStatusIndicator({
  isRunning,
  tone,
}: {
  isRunning: boolean;
  tone: RowStatusTone;
}) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
      {isRunning ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : (
        <span
          className={cn("size-1.5 rounded-full", {
            "bg-green-500 dark:bg-green-700": tone === "success",
            "bg-destructive": tone === "danger",
            "bg-amber-500": tone === "warning",
            "bg-muted-foreground/50": tone === "muted",
          })}
        />
      )}
    </span>
  );
}
