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

  const finalJobId =
    tool.state !== "input-streaming" ? backgroundJobId : undefined;

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        finalJobId ? (
          <BackgroundJobPanel
            backgroundJobId={finalJobId}
            output={tool.output?.output}
          />
        ) : null
      }
    />
  );
};
