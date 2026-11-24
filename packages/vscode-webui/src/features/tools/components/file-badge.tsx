import { CopyableImage } from "@/components/ui/copyable-image";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { addLineBreak, isImageFile } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import { formatPochiFileDisplayPath } from "@getpochi/common/pochi-file-system";
import { Loader2 } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EditSummary } from "./edit-summary";
import { FileIcon } from "./file-icon";

interface FileBadgeProps {
  label?: string;
  /** Hover text, useful when the label hides the underlying path. */
  title?: string;
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
  fallbackGlobPattern?: string;
  children?: ReactNode;
}

export const FileBadge: React.FC<FileBadgeProps> = ({
  label,
  title,
  path,
  startLine,
  endLine,
  onClick,
  className,
  labelClassName,
  isDirectory = false,
  editSummary,
  fallbackGlobPattern,
  children,
}) => {
  const lineRange = formatLineRange(startLine, endLine);
  const displayLabel = label || getFileBadgeDisplayLabel(path);

  const defaultOnClick = async () => {
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

  const badge = (
    <span
      title={title}
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

  if (!isDirectory && isImageFile(path)) {
    return (
      <ImageFilePreviewHoverCard
        key={`${path}:${fallbackGlobPattern ?? ""}`}
        path={path}
        displayLabel={displayLabel}
        fallbackGlobPattern={fallbackGlobPattern}
      >
        {badge}
      </ImageFilePreviewHoverCard>
    );
  }

  return badge;
};

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; dataUrl: string }
  | { status: "error" };

function ImageFilePreviewHoverCard({
  path,
  displayLabel,
  fallbackGlobPattern,
  children,
}: {
  path: string;
  displayLabel: string;
  fallbackGlobPattern?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [previewState, setPreviewState] = useState<PreviewState>({
    status: "idle",
  });
  const requestIdRef = useRef(0);

  const handleOpenChange = (open: boolean) => {
    if (
      !open ||
      previewState.status === "loading" ||
      previewState.status === "loaded"
    ) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setPreviewState({ status: "loading" });

    vscodeHost
      .readImagePreview(path, { fallbackGlobPattern })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        if (result?.dataUrl) {
          setPreviewState({ status: "loaded", dataUrl: result.dataUrl });
        } else {
          setPreviewState({ status: "error" });
        }
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setPreviewState({ status: "error" });
      });
  };

  const filename = path.split(/[\\/]/).pop() || displayLabel;

  return (
    <HoverCard openDelay={300} closeDelay={200} onOpenChange={handleOpenChange}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        className="max-h-[80vh] w-auto max-w-[95vw] p-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2">
          <div className="max-w-[300px] truncate font-medium text-xs">
            {displayLabel}
          </div>
          {previewState.status === "loading" && (
            <div className="flex h-24 w-36 items-center justify-center rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {previewState.status === "loaded" && (
            <div className="overflow-hidden rounded-md border border-[var(--vscode-input-border)]">
              <CopyableImage
                src={previewState.dataUrl}
                alt={displayLabel}
                filename={filename}
                className="h-auto max-w-[90vw] object-contain"
                style={{
                  maxHeight: "calc(60vh - 1rem)",
                  minWidth: "120px",
                }}
              />
            </div>
          )}
          {previewState.status === "error" && (
            <div className="py-1 text-muted-foreground text-xs">
              {t("fileBadge.imagePreviewUnavailable")}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

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
