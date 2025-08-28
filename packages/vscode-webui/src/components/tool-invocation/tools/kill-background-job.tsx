import { CommandExecutionPanel } from "../command-execution-panel";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { getBackgroundJobCommandFromMessages } from "../util";

export const KillBackgroundJobTool: React.FC<
  ToolProps<"killBackgroundJob">
> = ({ tool, isExecuting, messages }) => {
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">I will stop the following background job</span>
    </>
  );

  let detail: React.ReactNode;
  if (tool.state === "output-available" || tool.state === "input-available") {
    const { backgroundJobId } = tool.input;

    const command =
      getBackgroundJobCommandFromMessages(messages, backgroundJobId) ??
      `Job id: ${backgroundJobId}`;
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
