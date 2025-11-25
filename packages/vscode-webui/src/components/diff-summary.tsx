import { EditSummary } from "@/components/tool-invocation/edit-summary";
import { FileIcon } from "@/components/tool-invocation/file-icon/file-icon";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTaskChangedFiles } from "@/features/chat";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff as FileDiffIcon,
  Undo,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

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
  messages: Message[];
  taskId: string;
  className?: string;
  actionEnabled: boolean;
}

export function DiffSummary({
  messages,
  taskId,
  className,
  actionEnabled,
}: DiffSummaryProps) {
  const {
    changedFiles,
    showFileChanges,
    revertFileChanges,
    acceptChangedFile,
  } = useTaskChangedFiles(taskId, messages, actionEnabled);

  const [collapsed, setCollapsed] = useState(true);

  const displayFiles = useMemo(
    () => changedFiles.filter((file) => file.state === "pending"),
    [changedFiles],
  );

  const totalAdditions = displayFiles.reduce(
    (sum, file) => sum + file.added,
    0,
  );
  const totalDeletions = displayFiles.reduce(
    (sum, file) => sum + file.removed,
    0,
  );

  if (displayFiles.length === 0) {
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
            {displayFiles.length} file{displayFiles.length !== 1 ? "s" : ""}{" "}
            changed
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
            className="h-7 gap-1.5"
          >
            Keep
          </Button>
          <Button
            disabled={actionEnabled === false}
            variant="outline"
            size="xs"
            onClick={() => revertFileChanges()}
            className="h-7 gap-1.5"
          >
            Undo
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => showFileChanges()}
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
            {displayFiles.map((file) => {
              const fileName = file.filepath.split("/").pop() || file.filepath;

              return (
                <div
                  key={file.filepath}
                  onClick={() => {
                    vscodeHost.openFile(file.filepath);
                  }}
                >
                  <div className="group flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-border/30">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileIcon path={file.filepath} className="shrink-0" />
                      <button
                        type="button"
                        className={cn("truncate font-medium text-sm", {
                          "line-through": file.isDeleted,
                        })}
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
                          <TooltipContent>Keep</TooltipContent>
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
                              <Undo className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Undo</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => showFileChanges(file.filepath)}
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
