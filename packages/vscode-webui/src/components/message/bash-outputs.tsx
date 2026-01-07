import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  outputs: string[];
}

/**
 * Displays workflow bash outputs in a collapsible list.
 */
export const BashOutputsPart: React.FC<Props> = ({ outputs }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const title = t("messageList.bashOutputs", "Bash Outputs");

  if (!outputs.length) return null;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-1 mb-2 rounded-md border"
    >
      <CollapsibleTrigger asChild>
        <div className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 hover:bg-border/30">
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
          <TerminalSquare className="size-4 shrink-0" />
          <div className="font-semibold text-sm">{title}</div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
          {outputs.map((output, index) => (
            <pre
              key={index}
              className="whitespace-pre-wrap rounded border bg-muted/50 p-2 text-xs"
            >
              {output}
            </pre>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
