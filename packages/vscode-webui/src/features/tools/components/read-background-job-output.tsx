import { formatTerminalDisplayName } from "@/lib/terminal-display-name";
import { useTranslation } from "react-i18next";
import { BackgroundJobPanel } from "./command-execution-panel";
import { HighlightedText } from "./highlight-text";
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
  const terminalDisplayName = formatTerminalDisplayName(
    terminalName,
    lastCommand,
  );
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {isUserTerminal
          ? t("toolInvocation.readTerminal")
          : t("toolInvocation.readBackground")}
      </span>
      {terminalDisplayName && (
        <>
          {" "}
          <HighlightedText>{terminalDisplayName}</HighlightedText>
        </>
      )}
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
            terminalName={terminalName}
            lastCommand={lastCommand}
          />
        ) : null
      }
    />
  );
};
