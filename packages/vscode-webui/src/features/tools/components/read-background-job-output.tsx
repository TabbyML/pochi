import { getToolPartError } from "@/lib/tool-call-error";
import { useTranslation } from "react-i18next";
import { BackgroundJobPanel } from "./command-execution-panel";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const ReadBackgroundJobOutputTool: React.FC<
  ToolProps<"readBackgroundJobOutput">
> = ({ tool, isExecuting }) => {
  const { t } = useTranslation();
  const { backgroundJobId } = tool.input || {};
  const isUserTerminal = backgroundJobId?.startsWith("term-");
  const terminalName = isUserTerminal ? tool.output?.terminalName : undefined;
  const lastCommand = isUserTerminal ? tool.output?.lastCommand : undefined;
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {isUserTerminal
          ? t("toolInvocation.readTerminal")
          : t("toolInvocation.readBackground")}
      </span>
    </>
  );

  const hasError = getToolPartError(tool) !== undefined;
  const finalJobId =
    tool.state !== "input-streaming" && !hasError ? backgroundJobId : undefined;

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        finalJobId ? (
          <BackgroundJobPanel
            backgroundJobId={finalJobId}
            output={tool.output?.output}
            terminalName={terminalName}
            lastCommand={lastCommand}
          />
        ) : null
      }
    />
  );
};
