import { useToolCallLifeCycle } from "@/features/chat";
import { getToolName } from "ai";
import { useCallback } from "react";
import { FileBadge } from "../file-badge";
import { NewProblems, NewProblemsIcon } from "../new-problems";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { UserEdits } from "../user-edits";

export const applyDiffTool: React.FC<ToolProps<"applyDiff">> = ({
  tool,
  isExecuting,
  changes,
}) => {
  const { path } = tool.input || {};
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName: getToolName(tool),
    toolCallId: tool.toolCallId,
  });
  const handleClick = useCallback(() => {
    lifecycle.preview(tool.input, tool.state);
  }, [tool, lifecycle]);

  const result =
    tool.state === "output-available" && !("error" in tool.output)
      ? tool.output
      : undefined;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {"Applying diff to "}
      {path && (
        <FileBadge
          className="ml-1"
          path={path}
          onClick={
            tool.state !== "output-available" &&
            (lifecycle.status === "init" || lifecycle.status === "pending")
              ? handleClick
              : undefined
          }
          editSummary={result?._meta?.editSummary}
          changes={result?.success ? changes : undefined}
        />
      )}
    </>
  );

  const details = [];
  if (result?.newProblems) {
    details.push(
      <NewProblems key="new-problems" newProblems={result?.newProblems} />,
    );
  }

  if (result?.userEdits) {
    details.push(<UserEdits key="user-edits" userEdits={result?.userEdits} />);
  }

  const detail = details.length > 0 ? <>{details}</> : undefined;

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={detail}
      expandableDetailIcon={result?.newProblems && <NewProblemsIcon />}
    />
  );
};
