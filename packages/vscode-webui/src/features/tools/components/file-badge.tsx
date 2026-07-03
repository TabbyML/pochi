import type { ToolCallCheckpoint } from "@/components/message/message-list";
import { cn } from "@/lib/utils";
import { addLineBreak } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import { formatPochiFileDisplayPath } from "@getpochi/common/pochi-file-system";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EditSummary } from "./edit-summary";
import { FileIcon } from "./file-icon";

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
  children?: ReactNode;
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
  children,
}) => {
  const { t } = useTranslation();

  const lineRange = formatLineRange(startLine, endLine);
  const displayLabel = label || getFileBadgeDisplayLabel(path);

  const defaultOnClick = async () => {
    if (changes?.origin && changes?.modified) {
      const showDiffSuccess = await vscodeHost.showCheckpointDiff(
        `${path} ${t("fileBadge.modifiedByPochi")}`,
        {
          origin: changes.origin,
          modified: changes.modified,
        },
        [path],
      );
      if (showDiffSuccess) {
        return;
      }
    }
    const options: {
      start?: number;
      end?: number;
      fallbackGlobPattern?: string;
      webviewKind: "sidebar" | "pane";
    } = {
      fallbackGlobPattern: fallbackGlobPattern,
      webviewKind: globalThis.POCHI_WEBVIEW_KIND,
    };
    if (startLine !== undefined) {
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
        {addLineBreak(displayLabel)}
        <span className="text-zinc-500 dark:text-zinc-400">{lineRange}</span>
      </span>
      {editSummary && <EditSummary editSummary={editSummary} />}
      {children}
    </span>
  );
};

export function getFileBadgeDisplayLabel(path: string) {
  return formatPochiFileDisplayPath(path, {
    homeDir: globalThis.POCHI_HOME_DIR,
  });
}

/**
 * Formats the line range suffix shown after a file path.
 * - both provided: `:start` when equal, otherwise `:start-end`
 * - only startLine: `:start-` (from the given line to the end of the file)
 * - only endLine: `:1-end` (from the beginning of the file to the given line)
 * - neither: empty string
 */
function formatLineRange(startLine?: number, endLine?: number) {
  if (startLine !== undefined && endLine !== undefined) {
    return startLine === endLine ? `:${startLine}` : `:${startLine}-${endLine}`;
  }
  if (startLine !== undefined) {
    return `:${startLine}-`;
  }
  if (endLine !== undefined) {
    return `:1-${endLine}`;
  }
  return "";
}
