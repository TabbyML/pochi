import { Button } from "@/components/ui/button";
import { ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parsePatchFiles, resolveThemes } from "@pierre/diffs";
import { FileDiff, Virtualizer } from "@pierre/diffs/react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Columns2, Rows2, WrapText } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  [data-code] {
    scrollbar-width: none;
  }
  [data-code]::-webkit-scrollbar {
    width: 0;
    height: 0;
  }`;
const patchDiffStyle = {
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
const nativeScrollbarClassName =
  "bg-[var(--vscode-editor-background)] pr-3 [scrollbar-color:var(--vscode-scrollbarSlider-background)_var(--vscode-editor-background)] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:h-[10px] [&::-webkit-scrollbar]:w-[10px] [&::-webkit-scrollbar-corner]:bg-[var(--vscode-editor-background)] [&::-webkit-scrollbar-track]:bg-[var(--vscode-editor-background)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--vscode-scrollbarSlider-background)] [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb:active]:bg-[var(--vscode-scrollbarSlider-activeBackground)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--vscode-scrollbarSlider-hoverBackground)]";
const radixScrollbarClassName =
  "bg-[var(--vscode-editor-background)] [&_[data-slot=scroll-area-thumb]]:rounded-full";

const resolveThemesOnce = async () => {
  if (themesResolved) return;
  try {
    await resolveThemes(["dark-plus", "light-plus"]);
    themesResolved = true;
  } catch (err) {
    console.error("Failed to resolve themes for diff viewer:", err);
  }
};

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
  const diffViewerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollbarViewportRef = useRef<HTMLDivElement>(null);
  const [horizontalScrollbarWidth, setHorizontalScrollbarWidth] = useState(0);

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

  useEffect(() => {
    if (!isReady || !fileDiff) return;

    const diffViewer = diffViewerRef.current;
    const viewport = horizontalScrollbarViewportRef.current;
    if (!diffViewer || !viewport) return;

    if (lineWrap) {
      setHorizontalScrollbarWidth(0);
      return;
    }

    const observedCodeElements = new Set<HTMLElement>();
    let scrollSource: "proxy" | "code" | undefined;
    let resetScrollSourceId: number | undefined;

    const holdScrollSource = (source: "proxy" | "code") => {
      scrollSource = source;
      window.clearTimeout(resetScrollSourceId);
      resetScrollSourceId = window.setTimeout(() => {
        scrollSource = scrollSource === source ? undefined : scrollSource;
      }, 150);
    };

    const syncCodeScrollLeft = (scrollLeft: number) => {
      for (const codeScrollElement of observedCodeElements) {
        if (codeScrollElement.scrollLeft !== scrollLeft) {
          codeScrollElement.scrollLeft = scrollLeft;
        }
      }
    };

    const syncFromProxy = () => {
      if (scrollSource === "code") return;

      holdScrollSource("proxy");
      syncCodeScrollLeft(viewport.scrollLeft);
    };

    const syncFromCode = (event: Event) => {
      if (scrollSource === "proxy") {
        syncCodeScrollLeft(viewport.scrollLeft);
        return;
      }

      const scrollLeft = (event.currentTarget as HTMLElement).scrollLeft;
      holdScrollSource("code");
      viewport.scrollLeft = scrollLeft;
      syncCodeScrollLeft(scrollLeft);
    };

    const refreshScrollProxy = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(diffViewer);
      resizeObserver.observe(viewport);

      let maxScrollLeft = 0;
      const currentCodeElements = new Set<HTMLElement>();
      for (const fileDiffElement of diffViewer.querySelectorAll<HTMLElement>(
        ".diff-viewer-file-diff",
      )) {
        const shadowRoot = fileDiffElement.shadowRoot;
        if (!shadowRoot) continue;

        mutationObserver.observe(shadowRoot, {
          childList: true,
          subtree: true,
        });

        for (const codeScrollElement of shadowRoot.querySelectorAll<HTMLElement>(
          "[data-code]",
        )) {
          currentCodeElements.add(codeScrollElement);
          maxScrollLeft = Math.max(
            maxScrollLeft,
            codeScrollElement.scrollWidth - codeScrollElement.clientWidth,
          );
          resizeObserver.observe(codeScrollElement);
          if (!observedCodeElements.has(codeScrollElement)) {
            codeScrollElement.addEventListener("scroll", syncFromCode, {
              passive: true,
            });
            observedCodeElements.add(codeScrollElement);
          }
        }
      }

      for (const codeScrollElement of observedCodeElements) {
        if (currentCodeElements.has(codeScrollElement)) continue;
        codeScrollElement.removeEventListener("scroll", syncFromCode);
        observedCodeElements.delete(codeScrollElement);
      }

      const scrollWidth = viewport.clientWidth + Math.max(0, maxScrollLeft);
      setHorizontalScrollbarWidth(scrollWidth);
      if (viewport.scrollLeft > maxScrollLeft) {
        viewport.scrollLeft = maxScrollLeft;
      }
      syncCodeScrollLeft(viewport.scrollLeft);
    };

    viewport.addEventListener("scroll", syncFromProxy, { passive: true });

    const resizeObserver = new ResizeObserver(refreshScrollProxy);
    const mutationObserver = new MutationObserver(refreshScrollProxy);
    mutationObserver.observe(diffViewer, { childList: true, subtree: true });

    refreshScrollProxy();

    return () => {
      viewport.removeEventListener("scroll", syncFromProxy);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (resetScrollSourceId !== undefined) {
        window.clearTimeout(resetScrollSourceId);
      }
      for (const codeScrollElement of observedCodeElements) {
        codeScrollElement.removeEventListener("scroll", syncFromCode);
      }
    };
  }, [fileDiff, isReady, lineWrap]);

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
      <div ref={diffViewerRef} className="min-w-0">
        <Virtualizer
          className={cn(
            "diff-viewer-virtualizer max-h-60 overflow-y-scroll",
            nativeScrollbarClassName,
          )}
          contentClassName="min-w-full"
        >
          <FileDiff
            className="diff-viewer-file-diff"
            fileDiff={fileDiff}
            options={patchDiffOptions}
            metrics={patchDiffMetrics}
            style={patchDiffStyle}
          />
        </Virtualizer>
        <ScrollAreaPrimitive.Root
          data-slot="scroll-area"
          data-diff-viewer-horizontal-scrollbar=""
          type="always"
          className="relative mr-3 h-3 min-w-0 bg-[var(--vscode-editor-background)]"
        >
          <ScrollAreaPrimitive.Viewport
            data-slot="scroll-area-viewport"
            ref={horizontalScrollbarViewportRef}
            className="h-full w-full rounded-[inherit]"
          >
            <div
              aria-hidden="true"
              data-diff-viewer-horizontal-scrollbar-spacer=""
              style={{ height: 1, width: horizontalScrollbarWidth }}
            />
          </ScrollAreaPrimitive.Viewport>
          <ScrollBar
            orientation="horizontal"
            className={radixScrollbarClassName}
          />
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      </div>
    </div>
  );
}
