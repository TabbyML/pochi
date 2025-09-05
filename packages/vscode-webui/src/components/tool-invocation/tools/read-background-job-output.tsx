import { BackgroundJobPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const ReadBackgroundJobOutputTool: React.FC<
  ToolProps<"readBackgroundJobOutput">
> = ({ tool, isExecuting }) => {
  const { regex } = tool.input || {};
  const backgroundJobId =
    tool.state !== "input-streaming" ? tool.input?.backgroundJobId : undefined;
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">Reading background job output</span>
      {regex && (
        <>
          {" "}
          with regex filter: <HighlightedText>{regex}</HighlightedText>
        </>
      )}
    </>
  );

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        backgroundJobId ? (
          <BackgroundJobPanel
            backgroundJobId={backgroundJobId}
            output={tool.output?.output}
          />
        ) : null
      }
    />
  );
};
