import { CommandExecutionPanel } from "../command-execution-panel";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const ReadCommandOutputTool: React.FC<
  ToolProps<"readCommandOutput">
> = ({ tool, isExecuting }) => {
  const { backgroundCommandId } = tool.input || {};
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">Reading background command output</span>
    </>
  );

  let output: string | undefined;
  let command: string | undefined;
  let detail: React.ReactNode;
  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    "output" in tool.output &&
    typeof tool.output.output === "string"
  ) {
    output = tool.output.output;
    command =
      tool.output?._meta.command ?? `Command id: ${backgroundCommandId}`;
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
