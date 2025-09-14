import { BackgroundJobPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { useTranslation } from "react-i18next";

export const StartBackgroundJobTool: React.FC<
  ToolProps<"startBackgroundJob">
> = ({ tool, isExecuting }) => {
  const { t } = useTranslation();
  const { cwd } = tool.input || {};

  const backgroundJobId =
    tool.state === "output-available" ? tool.output.backgroundJobId : undefined;

  const cwdNode = cwd ? (
    <span>
      {" "}
      {t('toolInvocation.in')} <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;
  const text = t('toolInvocation.backgroundExecute');
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
        ) : null
      }
    />
  );
};
