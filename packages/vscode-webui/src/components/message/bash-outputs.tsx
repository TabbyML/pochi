import { CollapsibleSection } from "@/components/ui/collapsible-section";
import type { BashOutputs } from "@getpochi/common/vscode-webui-bridge";
import { TerminalSquare } from "lucide-react";
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
  const title = t("messageList.bashOutputs", "Bash Outputs");
  const red = "\x1b[31m";
  const reset = "\x1b[0m";

  if (!outputs.length) return null;

  return (
    <CollapsibleSection
      title={
        <>
          <TerminalSquare className="size-4 shrink-0" />
          {title}
        </>
      }
      contentClassName="gap-2 px-3 pt-1 pb-3"
    >
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
    </CollapsibleSection>
  );
};
