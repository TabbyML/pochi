import { useToolCallLifeCycle } from "@/features/chat";
import { getStaticToolName } from "ai";
import { TerminalIcon } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  BackgroundJobPanel,
  CommandExecutionPanel,
  CommandPanelContainer,
  CopyCommandButton,
} from "./command-execution-panel";
import { HighlightedText } from "./highlight-text";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const executeCommandTool: React.FC<ToolProps<"executeCommand">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName: getStaticToolName(tool),
    toolCallId: tool.toolCallId,
  });
  const abortTool = useCallback(() => {
    lifecycle.abort();
  }, [lifecycle.abort]);

  const { cwd, command, background } = tool.input || {};
  const backgroundJobMetadata =
    tool.state === "output-available" ? tool.output._meta : undefined;
  const isPromoted = !background && Boolean(backgroundJobMetadata);
  const cwdNode = cwd ? (
    <span>
      {" "}
      {t("toolInvocation.in")} <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;
  const text = background
    ? t("toolInvocation.backgroundExecute")
    : isPromoted
      ? t("toolInvocation.startedCommand")
      : t("toolInvocation.executeCommand");
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {text}
        {cwdNode}
        {isPromoted && (
          <span data-testid="command-promotion-transition">
            {t("toolInvocation.promotedToBackground")}
          </span>
        )}
      </span>
    </>
  );

  const { streamingResult } = lifecycle;

  if (streamingResult && streamingResult.toolName !== "executeCommand") {
    throw new Error("Unexpected streaming result for executeCommand tool");
  }

  if (background || isPromoted) {
    const availableCommand =
      tool.state === "input-available" || tool.state === "output-available"
        ? tool.input.command
        : undefined;

    return (
      <ExpandableToolContainer
        title={title}
        detail={
          backgroundJobMetadata ? (
            <BackgroundJobPanel
              backgroundJobId={backgroundJobMetadata.backgroundJobId}
              outputFile={backgroundJobMetadata.outputFile}
            />
          ) : availableCommand ? (
            <CommandPanelContainer
              icon={<TerminalIcon className="mt-[2px] size-4 flex-shrink-0" />}
              title={availableCommand}
              actions={<CopyCommandButton command={availableCommand} />}
            />
          ) : null
        }
      />
    );
  }

  let output = streamingResult?.output.content || "";
  let completed = false;
  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    "output" in tool.output
  ) {
    output = tool.output.output ?? "";
    completed = true;
  }

  return (
    <ExpandableToolContainer
      title={title}
      detail={
        <CommandExecutionPanel
          command={command ?? ""}
          output={output}
          onStop={abortTool}
          completed={completed}
          isExecuting={isExecuting}
        />
      }
    />
  );
};
