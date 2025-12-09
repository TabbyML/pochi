import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { useTaskChangedFiles } from "@/features/chat";
import { EditSummary, FileIcon } from "@/features/tools";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VscDiffMultiple, VscDiscard, VscGoToFile } from "react-icons/vsc";
import { formatPathForDisplay } from "./prompt-form/utils";

const collapsibleSectionVariants = {
  open: {
    height: "auto",
    transition: { duration: 0.1, ease: "easeOut" },
  },
  collapsed: {
    height: 0,
    transition: { duration: 0.1, ease: "easeIn" },
  },
};

export interface DiffSummaryProps
  extends ReturnType<typeof useTaskChangedFiles> {
  actionEnabled: boolean;
  className?: string;
}

export function DiffSummary({
  visibleChangedFiles,
  showFileChanges,
  revertFileChanges,
  acceptChangedFile,
  actionEnabled,
  className,
}: DiffSummaryProps) {
  const { t } = useTranslation();

  const [collapsed, setCollapsed] = useState(true);

  const totalAdditions = visibleChangedFiles.reduce(
    (sum, file) => sum + file.added,
    0,
  );
  const totalDeletions = visibleChangedFiles.reduce(
    (sum, file) => sum + file.removed,
    0,
  );

  if (visibleChangedFiles.length === 0) {
    return null;
  }

  return (
    <div className={cn("overflow-hidden rounded-sm", className)}>
      {/* Header */}
      <div
        className={cn(
          "flex cursor-pointer items-center justify-between border-border px-3 py-1.5 hover:bg-border/30",
        )}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2 font-medium text-sm">
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          <span>
            {t("diffSummary.filesChanged", {
              count: visibleChangedFiles.length,
            })}
          </span>
          <EditSummary
            editSummary={{ added: totalAdditions, removed: totalDeletions }}
            className="text-sm"
          />
        </div>

        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            disabled={actionEnabled === false}
            variant="default"
            size="xs"
            onClick={() => acceptChangedFile()}
            className="h-6 gap-1.5"
          >
            {t("diffSummary.keep")}
          </Button>
          <Button
            disabled={actionEnabled === false}
            variant="outline"
            size="xs"
            onClick={() => revertFileChanges()}
            className="h-6 gap-1.5"
          >
            {t("diffSummary.undo")}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => showFileChanges()}
                className="h-7 w-7"
              >
                <VscDiffMultiple className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("diffSummary.viewChanges")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* File List */}
      <motion.div
        initial={false}
        animate={collapsed ? "collapsed" : "open"}
        variants={collapsibleSectionVariants}
        className="overflow-hidden"
      >
        <ScrollArea viewportClassname="max-h-[160px]" type="auto">
          <div>
            {visibleChangedFiles.map((file) => {
              const { basename, displayPath } = formatPathForDisplay(
                file.filepath,
              );

              return (
                <div
                  key={file.filepath}
                  onClick={() => {
                    showFileChanges(file.filepath);
                  }}
                >
                  <div className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-0.5 hover:bg-border/30">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileIcon path={file.filepath} className="shrink-0" />
                      <button
                        type="button"
                        className={cn(
                          "flex flex-nowrap items-center gap-2 truncate whitespace-nowrap font-medium text-sm",
                          {
                            "line-through": file.deleted,
                          },
                        )}
                      >
                        <span className="truncate">{basename}</span>
                        <span className="flex-1 truncate text-muted-foreground text-xs">
                          {displayPath}
                        </span>
                      </button>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <EditSummary
                        editSummary={{
                          added: file.added,
                          removed: file.removed,
                        }}
                        className="text-sm"
                      />
                      <div className="hidden items-center gap-1 group-hover:flex">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              disabled={actionEnabled === false}
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                acceptChangedFile(file.filepath);
                              }}
                              className="h-5 w-5"
                            >
                              <Check className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("diffSummary.keep")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              disabled={actionEnabled === false}
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                revertFileChanges(file.filepath);
                              }}
                              className="h-5 w-5"
                            >
                              <VscDiscard className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("diffSummary.undo")}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                vscodeHost.openFile(file.filepath);
                              }}
                              className="h-5 w-5"
                            >
                              <VscGoToFile className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t("diffSummary.openFile")}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </motion.div>
    </div>
  );
}
