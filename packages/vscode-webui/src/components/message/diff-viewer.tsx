import { Button } from "@/components/ui/button";
import { ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Virtualizer as DiffsVirtualizer,
  parsePatchFiles,
  resolveThemes,
} from "@pierre/diffs";
import { FileDiff, VirtualizerContext } from "@pierre/diffs/react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Columns2, Rows2, WrapText } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme-provider";
import { CodeBlock } from "./code-block";

export interface DiffViewerProps {
  /** The diff patch content to display */
  patch: string;
  /** The file path to display in the header */
  filePath?: string;
}

// Pre-resolve themes to avoid async loading on each render
let themesResolved = false;
const patchDiffUnsafeCSS = `
  [data-separator="line-info"] {
    height: 24px;
  }
  [data-overflow="scroll"] {
    min-width: 100%;
    width: max-content;
    --diffs-code-grid: var(--diffs-grid-number-column-width) minmax(max-content, 1fr);
  }
  [data-diff-type="split"][data-overflow="scroll"] {
    grid-template-columns: max-content max-content;
  }
  [data-code] {
    contain: none;
    container-type: normal;
    min-width: 100%;
    width: max-content;
    overflow: visible;
    scrollbar-width: none;
  }
  [data-code]::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  [data-unified] [data-separator="line-info"] [data-separator-wrapper] {
    width: var(--diffs-column-width, 100%);
  }
  [data-overflow="scroll"] [data-additions] [data-gutter] [data-separator="line-info"] [data-separator-wrapper] {
    width: calc(var(--diffs-column-width, 100%) - var(--diffs-gap-inline, var(--diffs-gap-fallback)));
  }
  [data-overflow="scroll"] [data-content] {
    min-width: max-content;
  }
  [data-overflow="scroll"] [data-line] {
    min-width: max-content;
  }
  [data-overflow="scroll"] [data-gutter],
  [data-overflow="scroll"] [data-annotation-content] {
    position: static;
  }`;
const patchDiffStyle = {
  minWidth: "100%",
  width: "max-content",
  "--diffs-font-family": "JetBrains Mono, monospace",
  "--diffs-font-size": "11px",
  "--diffs-line-height": 1.5,
  "--diffs-addition-color-override":
    "var(--vscode-editorGutter-addedBackground)",
  "--diffs-deletion-color-override":
    "var(--vscode-editorGutter-deletedBackground)",
  "--diffs-fg-number-addition-override":
    "var(--vscode-editorGutter-addedBackground)",
  "--diffs-fg-number-deletion-override":
    "var(--vscode-editorGutter-deletedBackground)",
} as React.CSSProperties;
const patchDiffMetrics = {
  lineHeight: 16.5,
  hunkLineCount: 30,
  diffHeaderHeight: 0,
  hunkSeparatorHeight: 24,
  fileGap: 8,
};
const diffViewerScrollbarClassName = cn(
  "[&_[data-slot=scroll-area-thumb]]:transition-colors",
  "[&_[data-slot=scroll-area-thumb]]:bg-[color-mix(in_srgb,var(--vscode-scrollbarSlider-background)_88%,var(--vscode-editor-foreground)_12%)]",
  "hover:[&_[data-slot=scroll-area-thumb]]:bg-[color-mix(in_srgb,var(--vscode-scrollbarSlider-hoverBackground)_90%,var(--vscode-editor-foreground)_10%)]",
  "active:[&_[data-slot=scroll-area-thumb]]:bg-[color-mix(in_srgb,var(--vscode-scrollbarSlider-activeBackground)_88%,var(--vscode-editor-foreground)_12%)]",
  "[&_[data-slot=scroll-area-thumb]:focus-visible]:bg-[color-mix(in_srgb,var(--vscode-scrollbarSlider-hoverBackground)_90%,var(--vscode-editor-foreground)_10%)]",
);
const resolveThemesOnce = async () => {
  if (themesResolved) return;
  try {
    await resolveThemes(["dark-plus", "light-plus"]);
    themesResolved = true;
  } catch (err) {
    console.error("Failed to resolve themes for diff viewer:", err);
  }
};

function DiffScrollAreaVirtualizer({
  children,
}: {
  children: React.ReactNode;
}) {
  const [virtualizer] = useState(() =>
    typeof window === "undefined" ? undefined : new DiffsVirtualizer(),
  );

  const viewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!virtualizer) return;

      if (node) {
        virtualizer.setup(node, node.firstElementChild ?? undefined);
        return;
      }

      virtualizer.cleanUp();
    },
    [virtualizer],
  );

  return (
    <VirtualizerContext.Provider value={virtualizer}>
      <ScrollAreaPrimitive.Root
        data-slot="scroll-area"
        data-diff-viewer-horizontal-scrollbar=""
        type="always"
        className="relative max-h-60 min-w-0"
      >
        <ScrollAreaPrimitive.Viewport
          data-slot="scroll-area-viewport"
          ref={viewportRef}
          className="[&>div]:!block max-h-60 w-full rounded-[inherit]"
        >
          <div data-diff-viewer-scroll-content="" className="w-max min-w-full">
            {children}
          </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar className={diffViewerScrollbarClassName} />
        <ScrollBar
          orientation="horizontal"
          className={diffViewerScrollbarClassName}
        />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </VirtualizerContext.Provider>
  );
}

export const DiffViewer = memo(function DiffViewer({
  patch,
  filePath,
}: DiffViewerProps) {
  return <DiffViewerImpl patch={patch} filePath={filePath} />;
});

DiffViewer.displayName = "DiffViewer";

function DiffViewerImpl({ patch, filePath }: DiffViewerProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(themesResolved);
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [lineWrap, setLineWrap] = useState(false);

  const fileDiff = useMemo(() => {
    try {
      const parsed = parsePatchFiles(patch, undefined, true);
      if (parsed.length !== 1 || parsed[0].files.length !== 1) {
        return undefined;
      }
      return parsed[0].files[0];
    } catch {
      return undefined;
    }
  }, [patch]);

  // Resolve themes on first render
  useEffect(() => {
    if (!themesResolved) {
      resolveThemesOnce().then(() => setIsReady(true));
    }
  }, []);

  const patchDiffOptions = useMemo(
    () => ({
      theme: theme === "dark" ? "dark-plus" : "light-plus",
      diffStyle,
      overflow: lineWrap ? ("wrap" as const) : ("scroll" as const),
      disableFileHeader: true,
      diffIndicators: "bars" as const,
      unsafeCSS: patchDiffUnsafeCSS,
    }),
    [theme, diffStyle, lineWrap],
  );

  const toggleDiffStyle = () => {
    setDiffStyle((prev) => (prev === "unified" ? "split" : "unified"));
  };

  const toggleLineWrap = () => {
    setLineWrap((prev) => !prev);
  };

  // If patch is invalid, fall back to CodeBlock render
  if (!fileDiff) {
    return <CodeBlock language="diff" value={patch} />;
  }

  // Don't render until themes are ready
  if (!isReady) {
    return (
      <div
        className={cn(
          "flex items-center justify-center p-4 text-muted-foreground text-sm",
        )}
      >
        {t("diffViewer.loading")}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "diff-viewer-container overflow-hidden rounded-sm border bg-[var(--vscode-editor-background)]",
      )}
    >
      {filePath && (
        <div className="flex items-center justify-between border-b px-2 py-1">
          {filePath && (
            <span className="truncate font-mono text-muted-foreground text-xs">
              {filePath}
            </span>
          )}
          <div className="ml-auto flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "size-6 p-0 text-xs opacity-70 hover:opacity-100",
                    lineWrap && "bg-accent opacity-100",
                  )}
                  onClick={toggleLineWrap}
                  aria-label={t("diffViewer.toggleLineWrap")}
                >
                  <WrapText className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="m-0">
                  {lineWrap
                    ? t("diffViewer.disableLineWrap")
                    : t("diffViewer.enableLineWrap")}
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 p-0 text-xs opacity-70 hover:opacity-100"
                  onClick={toggleDiffStyle}
                  aria-label={t("diffViewer.toggleView")}
                >
                  {diffStyle === "unified" ? (
                    <Columns2 className="size-4" />
                  ) : (
                    <Rows2 className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="m-0">
                  {diffStyle === "unified"
                    ? t("diffViewer.splitView")
                    : t("diffViewer.unifiedView")}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
      <DiffScrollAreaVirtualizer>
        <FileDiff
          className="diff-viewer-file-diff"
          fileDiff={fileDiff}
          options={patchDiffOptions}
          metrics={patchDiffMetrics}
          style={patchDiffStyle}
        />
      </DiffScrollAreaVirtualizer>
    </div>
  );
}
