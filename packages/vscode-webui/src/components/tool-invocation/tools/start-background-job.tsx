import { TerminalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BackgroundJobPanel,
  CommandPanelContainer,
  CopyCommandButton,
} from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const StartBackgroundJobTool: React.FC<
  ToolProps<"startBackgroundJob">
> = ({ tool, isExecuting }) => {
  const { t } = useTranslation();
  const { cwd } = tool.input || {};

  const command =
    tool.state === "input-available" || tool.state === "output-available"
      ? tool.input.command
      : undefined;

  const backgroundJobId =
    tool.state === "output-available" ? tool.output.backgroundJobId : undefined;

  const cwdNode = cwd ? (
    <span>
      {" "}
      {t("toolInvocation.in")} <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;
  const text = t("toolInvocation.backgroundExecute");
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {text}
        {cwdNode}
      </span>
    </>
  );

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        backgroundJobId ? (
          <BackgroundJobPanel backgroundJobId={backgroundJobId} />
        ) : command ? (
          <CommandPanelContainer
            icon={
              <div className="flex size-[16px] items-center justify-between">
                <TerminalIcon className="size-4" />
              </div>
            }
            title={command}
            actions={<CopyCommandButton command={command} />}
          />
        ) : null
      }
    />
  );
};
