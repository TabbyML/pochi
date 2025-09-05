import { BackgroundJobPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const StartBackgroundJobTool: React.FC<
  ToolProps<"startBackgroundJob">
> = ({ tool, isExecuting }) => {
  const { cwd } = tool.input || {};

  const backgroundJobId =
    tool.state === "output-available" ? tool.output.backgroundJobId : undefined;

  const cwdNode = cwd ? (
    <span>
      {" "}
      in <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;
  const text = "I will execute the following command in background";
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
