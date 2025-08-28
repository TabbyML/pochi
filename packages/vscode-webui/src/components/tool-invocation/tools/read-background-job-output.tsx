import { CommandExecutionPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { getBackgroundJobCommandFromMessages } from "../util";

export const ReadBackgroundJobOutputTool: React.FC<
  ToolProps<"readBackgroundJobOutput">
> = ({ tool, isExecuting, messages }) => {
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

  let detail: React.ReactNode;
  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    "output" in tool.output &&
    typeof tool.output.output === "string"
  ) {
    const { output } = tool.output;
    const { backgroundJobId } = tool.input;
    const command =
      getBackgroundJobCommandFromMessages(messages, backgroundJobId) ??
      `Job id: ${backgroundJobId}`;
    detail = (
      <CommandExecutionPanel
        command={command}
        output={output}
        completed={true}
        isExecuting={isExecuting}
        onStop={() => {}}
      />
    );
  }

  return <ExpandableToolContainer title={title} detail={detail} />;
};
