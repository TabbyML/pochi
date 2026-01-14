import { vscodeHost } from "@/lib/vscode";
import { useCallback } from "react";
import { FileBadge } from "./file-badge";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const editNotebookTool: React.FC<ToolProps<"editNotebook">> = ({
  tool,
  isExecuting,
}) => {
  const { path, cellId } = tool.input || {};

  // Parse cellId to determine if it's an index or actual ID
  const cellIndex = Number.parseInt(cellId || "", 10);
  const cellLabel = !Number.isNaN(cellIndex)
    ? `Cell ${cellIndex + 1}`
    : `Cell ID: ${cellId}`;

  const handleClick = useCallback(() => {
    if (path) {
      vscodeHost.openFile(path, {
        cellId,
      });
    }
  }, [path, cellId]);

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {"Editing "}
      {path && (
        <>
          <FileBadge className="ml-1" path={path} onClick={handleClick} />
          <span className="ml-1 text-muted-foreground">({cellLabel})</span>
        </>
      )}
    </>
  );

  return <ExpandableToolContainer title={title} />;
};
