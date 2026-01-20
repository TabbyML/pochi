import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  actions,
  className,
  contentClassName,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("mt-1 mb-2 rounded-md border", className)}
    >
      <CollapsibleTrigger asChild>
        <div className="group flex cursor-pointer select-none items-center gap-1 px-3 py-1.5 hover:bg-muted/50">
          <div className="flex flex-1 items-center gap-2 overflow-hidden font-semibold text-sm">
            {title}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn("flex flex-col", contentClassName)}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};
