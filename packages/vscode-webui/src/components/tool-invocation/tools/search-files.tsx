import type React from "react";
import { FileList } from "../file-list";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const searchFilesTool: React.FC<ToolProps<"searchFiles">> = ({
  tool,
  isExecuting,
}) => {
  const { path, regex, filePattern } = tool.input || {};

  let resultEl: React.ReactNode;
  let matches: { file: string; line: number; context: string }[] = [];
  let isTruncated = false;
  if (tool.state === "output-available" && !("error" in tool.output)) {
    matches = tool.output.matches ?? [];
    isTruncated = tool.output.isTruncated ?? false;
    resultEl =
      matches.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <FileList matches={matches} />
        </div>
      ) : null;
  }

  const searchCondition = (
    <>
      <HighlightedText>{regex}</HighlightedText> in{" "}
      <HighlightedText>{path}</HighlightedText>
      {filePattern && <HighlightedText>{filePattern}</HighlightedText>}
    </>
  );

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {isExecuting || tool.state !== "output-available" ? (
        <span>Searching for {searchCondition}</span>
      ) : (
        <span>
          Searching for {searchCondition}, {matches.length} matched
          {isTruncated && ", results truncated"}
        </span>
      )}
    </>
  );

  return <ExpandableToolContainer title={title} expandableDetail={resultEl} />;
};
