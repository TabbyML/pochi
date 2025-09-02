import { useBackgroundJobInfo } from "@/features/chat";
import { BackgroundJobPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const ReadBackgroundJobOutputTool: React.FC<
  ToolProps<"readBackgroundJobOutput">
> = ({ tool, isExecuting, messages }) => {
  const info = useBackgroundJobInfo(
    messages,
    tool.state !== "input-streaming" ? tool.input?.backgroundJobId : undefined,
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

  const detail: React.ReactNode = info ? (
    <BackgroundJobPanel
      command={info.command}
      displayId={info.displayId}
      output={tool.output?.output}
    />
  ) : null;

  return <ExpandableToolContainer title={title} detail={detail} />;
};
