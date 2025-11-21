import { EditSummary } from "@/components/tool-invocation/edit-summary";
import { FileIcon } from "@/components/tool-invocation/file-icon/file-icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TaskChangedFile } from "@/features/chat";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FileDiff as FileDiffIcon,
  Undo2,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

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

export interface DiffSummaryProps {
  files: TaskChangedFile[];
  onRevert: (filePath: string) => void;
  onRevertAll: () => void;
  onViewDiff: (filePath?: string) => void;
  className?: string;
}

export function DiffSummary({
  files,
  onRevert,
  onRevertAll,
  onViewDiff,
  className,
}: DiffSummaryProps) {
  const [collapsed, setCollapsed] = useState(true);

  const totalAdditions = files.reduce((sum, file) => sum + file.added, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.removed, 0);

  if (files.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border",
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex cursor-pointer items-center justify-between border-border px-3 py-1.5 hover:bg-border/30",
          !collapsed && "border-b",
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
            {files.length} file{files.length !== 1 ? "s" : ""} changed
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
            variant="outline"
            size="xs"
            onClick={() => onRevertAll()}
            className="h-7 gap-1.5"
          >
            <Undo2 className="size-3.5" />
            Undo
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onViewDiff()}
                className="h-7 w-7"
              >
                <FileDiffIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View changes</TooltipContent>
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
          <div className="divide-y divide-border">
            {files.map((file) => {
              const fileName = file.filepath.split("/").pop() || file.filepath;

              return (
                <div key={file.filepath}>
                  <div className="group flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-border/30">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileIcon path={file.filepath} className="shrink-0" />
                      <button
                        type="button"
                        onClick={() => onViewDiff(file.filepath)}
                        className="truncate font-medium text-sm"
                        title="View diff"
                      >
                        {fileName}
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
                              variant="ghost"
                              size="icon"
                              onClick={() => onRevert(file.filepath)}
                              className="h-5 w-5"
                            >
                              <Undo2 className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Undo changes</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onViewDiff(file.filepath)}
                              className="h-5 w-5"
                            >
                              <FileDiffIcon className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View changes</TooltipContent>
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
