import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FC, ReactNode } from "react";

/**
 * The badge in front of a job/terminal row: opens the live terminal, or --
 * once that terminal is gone -- its recorded output file.
 */
export const JobControlButton: FC<{
  label: string;
  isActive?: boolean;
  /** Nothing left to open: keep the badge, drop the interaction. */
  inert?: boolean;
  onClick: () => void;
  children: ReactNode;
}> = ({ label, isActive, inert, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      {inert ? (
        // A plain span rather than a disabled button: disabled buttons swallow
        // pointer events, which would hide the tooltip explaining why nothing
        // can be opened anymore.
        <span
          aria-label={label}
          className="inline-flex size-[16px] shrink-0 cursor-default items-center justify-center rounded-sm bg-secondary text-muted-foreground opacity-60"
        >
          {children}
        </span>
      ) : (
        <Button
          size="sm"
          aria-label={label}
          className={cn("size-[16px] rounded-sm ring-primary", {
            "ring-1": isActive,
          })}
          variant="secondary"
          onClick={onClick}
        >
          {children}
        </Button>
      )}
    </TooltipTrigger>
    <TooltipContent>
      <span>{label}</span>
    </TooltipContent>
  </Tooltip>
);
