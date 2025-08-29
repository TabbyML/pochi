import { useToolCallLifeCycle } from "@/features/chat";
import { getToolName } from "ai";
import { useCallback } from "react";
import { CommandExecutionPanel } from "../command-execution-panel";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const executeCommandTool: React.FC<ToolProps<"executeCommand">> = ({
  tool,
  isExecuting,
}) => {
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName: getToolName(tool),
    toolCallId: tool.toolCallId,
  });
  const abortTool = useCallback(() => {
    lifecycle.abort();
  }, [lifecycle.abort]);

  const { cwd, command } = tool.input || {};
  const cwdNode = cwd ? (
    <span>
      {" "}
      in <HighlightedText>{cwd}</HighlightedText>
    </span>
  ) : null;
  const text = "I will execute the following command";
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {text}
        {cwdNode}
      </span>
    </>
  );

  const { streamingResult } = lifecycle;

  if (streamingResult && streamingResult.toolName !== "executeCommand") {
    throw new Error("Unexpected streaming result for executeCommand tool");
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
