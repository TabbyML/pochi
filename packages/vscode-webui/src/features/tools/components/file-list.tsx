import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getBaseName, isFolder } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import { useState } from "react";
import { FileIcon } from "./file-icon";
import {
  type FileListMatch,
  MaxRenderedFileListItems,
  getVisibleFileListMatches,
} from "./file-list-utils";

export const FileList: React.FC<{
  matches: FileListMatch[];
  showBaseName?: boolean;
}> = ({ matches, showBaseName = true }) => {
  return (
    <FileListView
      matches={matches}
      showBaseName={showBaseName}
      maxItems={MaxRenderedFileListItems}
    />
  );
};

export const FullFileList: React.FC<{
  matches: FileListMatch[];
  showBaseName?: boolean;
}> = ({ matches, showBaseName = true }) => {
  return (
    <FileListView
      matches={matches}
      showBaseName={showBaseName}
      maxItems={Number.POSITIVE_INFINITY}
    />
  );
};

function FileListView({
  matches,
  showBaseName,
  maxItems,
}: {
  matches: FileListMatch[];
  showBaseName: boolean;
  maxItems: number;
}) {
  const [activeIndex, setActiveIndex] = useState(-1);
  if (matches.length === 0) {
    return null;
  }

  const { visibleMatches, hiddenCount } = getVisibleFileListMatches(
    matches,
    maxItems,
  );

  return (
    <ScrollArea
      className="flex max-h-[100px] flex-col gap-1 rounded border p-1"
      onBlur={(e) => {
        if (e.currentTarget === e.relatedTarget) {
          return;
        }
        setActiveIndex(-1);
      }}
      tabIndex={0}
    >
      {visibleMatches.map((match, index) => (
        <div
          key={match.file + (match.line ?? "") + index}
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
            {match.label ?? match.file}
          </span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="px-2 py-1 text-muted-foreground text-xs">
          {hiddenCount} more results not shown
        </div>
      )}
    </ScrollArea>
  );
}
