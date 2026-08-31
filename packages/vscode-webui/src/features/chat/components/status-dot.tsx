import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The status marker in front of a row in the background panel. Shared so job
 * rows, terminal rows and task rows all read their status the same way.
 *
 * A dot carries every resting status; work in progress gets a spinner, which
 * is the only state that has to be recognizable at a glance.
 */
export function StatusDot({ className }: { className?: string }) {
  return (
    <IndicatorSlot>
      <span className={cn("size-1.5 rounded-full", className)} />
    </IndicatorSlot>
  );
}

export function StatusSpinner({ className }: { className?: string }) {
  return (
    <IndicatorSlot>
      <Loader2
        className={cn("size-3.5 animate-spin text-primary", className)}
      />
    </IndicatorSlot>
  );
}

/** Keeps dots and spinners on the same column so row titles line up. */
function IndicatorSlot({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}
