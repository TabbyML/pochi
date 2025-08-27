import { CommandExecutionPanel } from "../command-execution-panel";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const KillBackgroundCommandTool: React.FC<
  ToolProps<"killBackgroundCommand">
> = ({ tool, isExecuting }) => {
  const { backgroundCommandId } = tool.input || {};
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">I will stop the following background command</span>
    </>
  );

  let command: string | undefined;
  let detail: React.ReactNode;
  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    "success" in tool.output &&
    tool.output.success === true
  ) {
    command =
      tool.output?._meta.command ?? `Command id: ${backgroundCommandId}`;
    detail = (
      <CommandExecutionPanel
        command={command}
        output=""
        completed={true}
        isExecuting={isExecuting}
        onStop={() => {}}
      />
    );
  }

  return <ExpandableToolContainer title={title} detail={detail} />;
};
