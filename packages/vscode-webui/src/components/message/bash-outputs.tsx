import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { BashOutputs } from "@getpochi/common/vscode-webui-bridge";
import { ChevronRight, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CommandExecutionPanel } from "../../features/tools/components/command-execution-panel";
import { ExpandableToolContainer } from "../../features/tools/components/tool-container";

interface Props {
  outputs: BashOutputs;
}

/**
 * Displays workflow bash outputs in a collapsible list.
 */
export const BashOutputsPart: React.FC<Props> = ({ outputs }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const title = t("messageList.bashOutputs", "Bash Outputs");
  const red = "\x1b[31m";
  const reset = "\x1b[0m";

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
          {outputs.map((entry, index) => (
            <ExpandableToolContainer
              key={index}
              title={""} // No need for title as we have the command in the detail panel
              detail={
                <CommandExecutionPanel
                  command={entry.command}
                  output={[
                    entry.output,
                    entry.error ? `${red}ERROR: ${entry.error}${reset}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n")}
                  onStop={() => {}}
                  completed
                  isExecuting={false}
                />
              }
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
