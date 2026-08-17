import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  BackgroundJobPanel,
  CommandPanelContainer,
  CopyCommandButton,
} from "./command-execution-panel";
import { HighlightedText } from "./highlight-text";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const StartMonitorTool: React.FC<ToolProps<"startMonitor">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();

  const { command, description } =
    tool.state === "input-available" || tool.state === "output-available"
      ? tool.input
      : { command: undefined, description: undefined };

  const backgroundJobId =
    tool.state === "output-available" ? tool.output.backgroundJobId : undefined;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {t("toolInvocation.startMonitor")}{" "}
        <HighlightedText>{description}</HighlightedText>
      </span>
    </>
  );

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        backgroundJobId ? (
          <BackgroundJobPanel
            backgroundJobId={backgroundJobId}
            icon={<Activity className="mt-[2px] size-4 flex-shrink-0" />}
          />
        ) : command ? (
          <CommandPanelContainer
            icon={<Activity className="mt-[2px] size-4 flex-shrink-0" />}
            title={command}
            actions={<CopyCommandButton command={command} />}
          />
        ) : null
      }
    />
  );
};
