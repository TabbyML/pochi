import { CodeBlock } from "@/components/message";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getActiveSelectionLabel } from "@/lib/utils/active-selection";
import {
  getFileExtension,
  languageIdFromExtension,
} from "@/lib/utils/languages";
import { vscodeHost } from "@/lib/vscode";
import type { ActiveSelection } from "@getpochi/common/vscode-webui-bridge";
import { ChevronRight, MousePointer2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VscGoToFile } from "react-icons/vsc";

interface Props {
  activeSelection: ActiveSelection;
}

export const ActiveSelectionPart: React.FC<Props> = ({ activeSelection }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (!activeSelection) return null;

  const { filepath, range, content, notebookCell } = activeSelection;

  const onOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeHost.openFile(filepath, {
      start: range.start.line + 1,
      end: range.end.line + 1,
      cellId: notebookCell?.cellId,
    });
  };

  const extension = getFileExtension(filepath);
  const language = languageIdFromExtension(extension) || "typescript";
  const hasContent = content.length > 0;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-1 mb-2 rounded-md border"
    >
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            "group flex select-none items-center justify-between border-border px-3 py-1.5 transition-colors",
            "cursor-pointer hover:bg-border/30",
          )}
        >
          <div className="flex min-h-5 items-center gap-1">
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-90",
              )}
            />
            <MousePointer2 className="size-3.5 shrink-0" />
            <div className="font-semibold text-sm">
              {t("activeSelection.title", {
                defaultValue: "Selection",
              })}
              <span className="ml-2 text-muted-foreground text-sm">
                {/* <FileIcon path={filepath} className="text-xs" /> */}
                <span className="ml-0.5">
                  {getActiveSelectionLabel(activeSelection, t)}
                  {!notebookCell &&
                    hasContent &&
                    `:${range.start.line + 1}-${range.end.line + 1}`}
                </span>
              </span>
            </div>
          </div>
          <div className="hidden items-center gap-1 group-hover:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onOpenFile}
                  className="h-5 w-5"
                >
                  <VscGoToFile className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("diffSummary.openFile")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {hasContent ? (
          <div className="pr-3 pb-2 pl-9">
            <CodeBlock
              className=""
              language={language}
              value={content}
              isMinimalView={true}
            />
          </div>
        ) : (
          <div className="pr-3 pb-2 pl-9 text-muted-foreground text-sm">
            {t("activeSelection.noContentSelected", {
              defaultValue: "No text selected in file",
            })}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
