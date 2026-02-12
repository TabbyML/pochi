import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parsePatchFiles, resolveThemes } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { Columns2, Rows2, WrapText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
const resolveThemesOnce = async () => {
  if (themesResolved) return;
  try {
    await resolveThemes(["dark-plus", "light-plus"]);
    themesResolved = true;
  } catch (err) {
    console.error("Failed to resolve themes for diff viewer:", err);
  }
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ patch, filePath }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [isReady, setIsReady] = useState(themesResolved);
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");
  const [lineWrap, setLineWrap] = useState(false);

  // Validate the patch using parsePatchFiles
  const isValidPatch = useMemo(() => {
    try {
      const parsed = parsePatchFiles(patch, undefined, true);
      // Check if we got at least one valid patch with files
      return parsed.length > 0 && parsed.some((p) => p.files.length > 0);
    } catch {
      return false;
    }
  }, [patch]);

  // Resolve themes on first render
  useEffect(() => {
    if (!themesResolved) {
      resolveThemesOnce().then(() => setIsReady(true));
    }
  }, []);

  const options = useMemo(
    () => ({
      theme: theme === "dark" ? "dark-plus" : "light-plus",
      diffStyle,
      overflow: lineWrap ? ("wrap" as const) : ("scroll" as const),
      disableFileHeader: true,
      diffIndicators: "bars" as const,
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
  if (!isValidPatch) {
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
      <div className="max-h-60 overflow-auto">
        <PatchDiff
          patch={patch}
          options={{
            ...options,
            unsafeCSS: `
            [data-separator="line-info"] {
              height: 24px;
            }`,
          }}
          style={
            {
              "--diffs-font-family": "JetBrains Mono, monospace",
              "--diffs-font-size": "11px",
              "--diffs-line-height": 1.5,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
};

DiffViewer.displayName = "DiffViewer";
