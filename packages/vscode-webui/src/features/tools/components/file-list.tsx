import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getBaseName, isFolder } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import {
  formatPochiFileDisplayPath,
  getPochiBuiltinFileDisplayInfo,
} from "@getpochi/common";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FileIcon } from "./file-icon";

export interface FileListMatch {
  file: string;
  line?: number;
  context?: string;
  label?: string;
}

const FileListDefaultRowHeight = 24;
const FileListViewportHeight = 100;
const FileListOverscan = 8;
const FileListVirtualizationThreshold = 50;

export function getVirtualFileListRange({
  itemCount,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
}: {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
}) {
  if (itemCount <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      totalHeight: 0,
    };
  }

  const visibleStart = Math.floor(scrollTop / rowHeight);
  const visibleEnd = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const startIndex = Math.max(visibleStart - overscan, 0);
  const endIndex = Math.min(visibleEnd + overscan, itemCount);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * rowHeight,
    totalHeight: itemCount * rowHeight,
  };
}

export const FileList: React.FC<{
  matches: FileListMatch[];
  showBaseName?: boolean;
}> = ({ matches, showBaseName = true }) => {
  const [activeIndex, setActiveIndex] = useState(-1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = useState(FileListDefaultRowHeight);
  const [scrollState, setScrollState] = useState({
    scrollTop: 0,
    viewportHeight: FileListViewportHeight,
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const syncScrollState = () => {
      setScrollState({
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.clientHeight || FileListViewportHeight,
      });
    };

    syncScrollState();
    viewport.addEventListener("scroll", syncScrollState);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(syncScrollState);
    resizeObserver?.observe(viewport);

    return () => {
      viewport.removeEventListener("scroll", syncScrollState);
      resizeObserver?.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measuredRowHeight = row.getBoundingClientRect().height;
    if (
      measuredRowHeight > 0 &&
      Math.abs(measuredRowHeight - rowHeight) > 0.5
    ) {
      setRowHeight(measuredRowHeight);
    }
  });

  const virtualRange = useMemo(
    () =>
      getVirtualFileListRange({
        itemCount: matches.length,
        scrollTop: scrollState.scrollTop,
        viewportHeight: scrollState.viewportHeight,
        rowHeight,
        overscan: FileListOverscan,
      }),
    [matches.length, scrollState, rowHeight],
  );
  const visibleMatches = matches.slice(
    virtualRange.startIndex,
    virtualRange.endIndex,
  );
  const shouldVirtualize = matches.length > FileListVirtualizationThreshold;

  if (matches.length === 0) {
    return null;
  }

  const renderMatch = (
    match: FileListMatch,
    index: number,
    renderedIndex: number,
  ) => {
    const displayPath = getFileListDisplayPath(match);
    return (
      <div
        key={match.file + (match.line ?? "") + index}
        ref={renderedIndex === 0 ? rowRef : undefined}
        className={`cursor-pointer truncate rounded py-0.5 ${activeIndex === index ? "bg-accent" : "hover:bg-accent/50"}`}
        title={match.context}
        onClick={() => {
          setActiveIndex(index);
          vscodeHost.openFile(match.file, {
            start: match.line,
            preserveFocus: true,
          });
        }}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: <explanation>
        tabIndex={0}
      >
        <span
          className={`truncate px-1 font-semibold ${activeIndex === index ? "text-accent-foreground" : "text-foreground"}`}
        >
          <FileIcon
            path={match.file}
            className="mr-1 ml-0.5 text-xl/4"
            defaultIconClassName="ml-0 mr-0.5" // Default icon is larger than others
            isDirectory={isFolder(match.file)}
          />
          {showBaseName && (
            <>
              {getBaseName(match.file)}
              {match.line && (
                <span
                  className={`truncate ${activeIndex === index ? "text-accent-foreground/70" : "text-foreground/70"}`}
                >
                  :{match.line}
                </span>
              )}
            </>
          )}
        </span>
        <span
          title={match.file}
          className={cn(
            activeIndex === index
              ? showBaseName
                ? "text-accent-foreground/70"
                : "text-accent-foreground"
              : showBaseName
                ? "text-foreground/70"
                : "text-foreground",
          )}
        >
          {displayPath}
        </span>
      </div>
    );
  };

  return (
    <ScrollArea
      ref={viewportRef}
      className="flex max-h-[100px] flex-col gap-1 rounded border p-1"
      viewportClassname={shouldVirtualize ? "max-h-[100px]" : undefined}
      onBlur={(e) => {
        if (e.currentTarget === e.relatedTarget) {
          return;
        }
        setActiveIndex(-1);
      }}
      tabIndex={0}
    >
      {!shouldVirtualize &&
        matches.map((match, index) => renderMatch(match, index, index))}
      {shouldVirtualize && (
        <div
          className="relative"
          style={{ height: `${virtualRange.totalHeight}px` }}
        >
          <div
            style={{
              transform: `translateY(${virtualRange.offsetTop}px)`,
            }}
          >
            {visibleMatches.map((match, renderedIndex) => {
              const index = virtualRange.startIndex + renderedIndex;

              return renderMatch(match, index, renderedIndex);
            })}
          </div>
        </div>
      )}
    </ScrollArea>
  );
};

function getFileListDisplayPath(match: FileListMatch) {
  if (match.label) {
    return match.label;
  }

  const builtInFile = getPochiBuiltinFileDisplayInfo(match.file);
  if (builtInFile?.isReference) {
    return builtInFile.relativePath;
  }

  return formatPochiFileDisplayPath(match.file);
}
