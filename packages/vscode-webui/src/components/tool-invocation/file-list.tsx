import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getFileName, isFolder } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import { useState } from "react";
import { FileIcon } from "./file-icon/file-icon";

export const FileList: React.FC<{
  matches: { file: string; line?: number; context?: string; label?: string }[];
  showBaseName?: boolean;
}> = ({ matches, showBaseName = true }) => {
  const [activeIndex, setActiveIndex] = useState(-1);
  if (matches.length === 0) {
    return null;
  }

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
      {matches.map((match, index) => (
        <div
          key={match.file + (match.line ?? "") + index}
          className={`cursor-pointer truncate rounded py-0.5 ${activeIndex === index ? "bg-secondary" : "hover:bg-secondary/50"}`}
          title={match.context}
          onClick={() => {
            setActiveIndex(index);
            vscodeHost.openFile(match.file, {
              start: match.line,
              preserveFocus: true,
              webviewKind: globalThis.POCHI_WEBVIEW_KIND,
            });
          }}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: <explanation>
          tabIndex={0}
        >
          <span
            className={`truncate px-1 font-semibold ${activeIndex === index ? "text-secondary-foreground" : "text-foreground"}`}
          >
            <FileIcon
              path={match.file}
              className="mr-1 ml-0.5 text-xl/4"
              defaultIconClassName="ml-0 mr-0.5" // Default icon is larger than others
              isDirectory={isFolder(match.file)}
            />
            {showBaseName && (
              <>
                {getFileName(match.file)}
                {match.line && (
                  <span
                    className={`truncate ${activeIndex === index ? "text-secondary-foreground/70" : "text-foreground/70"}`}
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
                  ? "text-secondary-foreground/70"
                  : "text-secondary-foreground"
                : showBaseName
                  ? "text-foreground/70"
                  : "text-foreground",
            )}
          >
            {match.label ?? match.file}
          </span>
        </div>
      ))}
    </ScrollArea>
  );
};
