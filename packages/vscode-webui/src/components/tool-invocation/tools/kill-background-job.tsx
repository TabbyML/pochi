import { useBackgroundJobInfo } from "@/lib/hooks/use-background-job-command";
import { BackgroundJobPanel } from "../command-execution-panel";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const KillBackgroundJobTool: React.FC<
  ToolProps<"killBackgroundJob">
> = ({ tool, isExecuting, messages }) => {
  const info = useBackgroundJobInfo(
    messages,
    tool.state !== "input-streaming" ? tool.input?.backgroundJobId : undefined,
  );

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">I will stop the following background job</span>
    </>
  );

  const detail = info ? (
    <BackgroundJobPanel command={info.command} displayId={info.displayId} />
  ) : null;

  return <ExpandableToolContainer title={title} detail={detail} />;
};
