import { useBackgroundJobCommand } from "@/lib/hooks/use-background-job-command";
import { BackgroundJobPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const ReadBackgroundJobOutputTool: React.FC<
  ToolProps<"readBackgroundJobOutput">
> = ({ tool, isExecuting, messages }) => {
  const command = useBackgroundJobCommand(
    messages,
    tool.input?.backgroundJobId,
  );
  const { regex } = tool.input || {};
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

  const detail: React.ReactNode = command ? (
    <BackgroundJobPanel command={command} output={tool.output?.output} />
  ) : null;

  return <ExpandableToolContainer title={title} detail={detail} />;
};
