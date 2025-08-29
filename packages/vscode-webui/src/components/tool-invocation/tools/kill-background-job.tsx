import { useBackgroundJobCommand } from "@/lib/hooks/use-background-job-command";
import { BackgroundJobPanel } from "../command-execution-panel";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const KillBackgroundJobTool: React.FC<
  ToolProps<"killBackgroundJob">
> = ({ tool, isExecuting, messages }) => {
  const command = useBackgroundJobCommand(
    messages,
    tool.input?.backgroundJobId,
  );

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">I will stop the following background job</span>
    </>
  );

  const detail = command ? <BackgroundJobPanel command={command} /> : null;

  return <ExpandableToolContainer title={title} detail={detail} />;
};
