import { cn } from "@/lib/utils";
import { addLineBreak } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import type { ToolCallCheckpoint } from "../message/message-list";
import { EditSummary } from "./edit-summary";
import { FileIcon } from "./file-icon/file-icon";

interface FileBadgeProps {
  label?: string;
  path: string;
  startLine?: number;
  endLine?: number;
  onClick?: () => void;
  className?: string;
  labelClassName?: string;
  isDirectory?: boolean;
  editSummary?: {
    added: number;
    removed: number;
  };
  changes?: ToolCallCheckpoint;
  fallbackGlobPattern?: string;
}

export const FileBadge: React.FC<FileBadgeProps> = ({
  label,
  path,
  startLine,
  endLine,
  onClick,
  className,
  labelClassName,
  isDirectory = false,
  editSummary,
  changes,
  fallbackGlobPattern,
}) => {
  const lineRange = startLine
    ? endLine && startLine !== endLine
      ? `:${startLine}-${endLine}`
      : `:${startLine}`
    : "";

  const defaultOnClick = async () => {
    if (changes?.origin && changes?.modified) {
      const showDiffSuccess = await vscodeHost.showCheckpointDiff(
        `${path} (Modified by Pochi)`,
        {
          origin: changes.origin,
          modified: changes.modified,
        },
        path,
      );
      if (showDiffSuccess) {
        return;
      }
    }
    const options: {
      start?: number;
      end?: number;
      fallbackGlobPattern?: string;
    } = {
      fallbackGlobPattern: fallbackGlobPattern,
    };
    if (startLine) {
      options.start = startLine;
      options.end = endLine;
    }

    vscodeHost.openFile(path, options);
  };
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick ? onClick() : defaultOnClick();
      }}
      className={cn(
        "mx-px cursor-pointer rounded-sm border border-border box-decoration-clone p-0.5 text-sm/6 hover:bg-zinc-200 active:bg-zinc-200 dark:active:bg-zinc-700 dark:hover:bg-zinc-700",
        className,
      )}
    >
      <FileIcon path={path} isDirectory={isDirectory} />
      <span className={cn("ml-0.5 break-words", labelClassName)}>
        {addLineBreak(label || path)}
        <span className="text-zinc-500 dark:text-zinc-400">{lineRange}</span>
      </span>
      {editSummary && <EditSummary editSummary={editSummary} />}
    </span>
  );
};
