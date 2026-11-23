import { useTranslation } from "react-i18next";
import { BackgroundJobPanel } from "./command-execution-panel";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const SendMessageTool: React.FC<ToolProps<"sendMessage">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const backgroundJobId =
    tool.state !== "input-streaming" ? tool.input?.backgroundJobId : undefined;
  const message =
    tool.state !== "input-streaming" ? tool.input?.message : undefined;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">{t("toolInvocation.sendMessage")}</span>
    </>
  );

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        backgroundJobId || message ? (
          <div className="flex flex-col gap-2">
            {backgroundJobId && (
              <BackgroundJobPanel backgroundJobId={backgroundJobId} />
            )}
            {message && (
              <div className="whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">
                {message}
              </div>
            )}
          </div>
        ) : null
      }
    />
  );
};
