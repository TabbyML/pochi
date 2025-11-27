import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTaskReadStatusStore } from "@/lib/hooks/use-task-read-status-store";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { cn } from "@/lib/utils";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import type { Task } from "@getpochi/livekit";
import {
  ChevronDown,
  ChevronRight,
  GitCompare,
  Terminal,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { TaskRow } from "./task-row";
import { ScrollArea } from "./ui/scroll-area";

interface WorktreeGroup {
  name: string;
  path: string;
  tasks: Task[];
  isDeleted: boolean;
  isMain: boolean;
  createdAt?: number;
}

export function WorktreeList({
  tasks,
}: {
  tasks: Task[];
}) {
  const { t } = useTranslation();
  const { data: worktrees } = useWorktrees();
  const [showDeleted, setShowDeleted] = useState(false);

  const groups = useMemo(() => {
    const worktreeMap = new Map(worktrees?.map((wt) => [wt.path, wt]));
    const worktreeIndexMap = new Map(
      worktrees?.map((wt, index) => [wt.path, index]),
    );

    // 1. Group tasks by cwd (worktree path)
    const taskGroups = R.pipe(
      tasks,
      R.filter((task) => !!task.cwd),
      R.groupBy((task) => task.cwd as string),
      R.mapValues((tasks, path) => {
        const latestTask = R.pipe(
          tasks,
          R.sortBy([(task) => new Date(task.createdAt).getTime(), "desc"]),
          R.first(),
        );
        return {
          path,
          tasks,
          createdAt: latestTask ? new Date(latestTask.createdAt).getTime() : 0,
        };
      }),
    );

    // 2. Create groups for worktrees without tasks
    const worktreeGroups = R.pipe(
      worktrees || [],
      R.filter((wt) => !taskGroups[wt.path]),
      R.map((wt) => ({
        path: wt.path,
        tasks: [],
        createdAt: 0,
      })),
      R.groupBy((g) => g.path),
      R.mapValues((groups) => groups[0]),
    );

    // 3. Merge and resolve names/isDeleted
    return R.pipe(
      { ...taskGroups, ...worktreeGroups },
      R.values(),
      R.map((group): WorktreeGroup => {
        const wt = worktreeMap.get(group.path);
        let name = "unknown";
        let isDeleted = true;
        let isMain = false;

        if (wt) {
          isDeleted = false;
          isMain = wt.isMain;
          if (wt.isMain) {
            name = "main";
          } else {
            name = getWorktreeNameFromWorktreePath(wt.path) || "unknown";
          }
        } else {
          name = getWorktreeNameFromWorktreePath(group.path) || "unknown";
        }

        return {
          ...group,
          name,
          isDeleted,
          isMain,
        };
      }),
      R.sort((a, b) => {
        // Sort: Existing first, then deleted
        if (a.isDeleted !== b.isDeleted) {
          return a.isDeleted ? 1 : -1;
        }

        if (!a.isDeleted) {
          const indexA =
            worktreeIndexMap.get(a.path) ?? Number.POSITIVE_INFINITY;
          const indexB =
            worktreeIndexMap.get(b.path) ?? Number.POSITIVE_INFINITY;
          return indexA - indexB;
        }

        return a.name.localeCompare(b.name);
      }),
    );
  }, [tasks, worktrees]);

  const activeGroups = groups.filter((g) => !g.isDeleted);
  const deletedGroups = groups.filter((g) => g.isDeleted);

  return (
    <div className="flex flex-col gap-1">
      {activeGroups.map((group) => (
        <WorktreeSection key={group.path} group={group} />
      ))}
      {deletedGroups.length > 0 && (
        <>
          <div className="group flex items-center py-2">
            <div className="h-px flex-1 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="mx-2 h-auto gap-2 py-0 text-muted-foreground text-xs hover:bg-transparent"
              onClick={() => setShowDeleted(!showDeleted)}
            >
              <Trash2 className="size-3" />
              <span className="w-0 overflow-hidden whitespace-nowrap transition-all group-hover:w-auto">
                {showDeleted
                  ? t("tasksPage.hideDeletedWorktrees")
                  : t("tasksPage.showDeletedWorktrees")}
              </span>
            </Button>
            <div className="h-px flex-1 bg-border" />
          </div>

          {showDeleted &&
            deletedGroups.map((group) => (
              <WorktreeSection key={group.path} group={group} />
            ))}
        </>
      )}
    </div>
  );
}

function WorktreeSection({
  group,
}: {
  group: WorktreeGroup;
}) {
  const { t } = useTranslation();
  // Default expanded for existing worktrees, collapsed for deleted
  const [isExpanded, setIsExpanded] = useState(!group.isDeleted);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const unreadTaskIds = useTaskReadStatusStore((state) => state.unreadTaskIds);

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="mb-2"
    >
      <div
        className="group flex h-6 items-center gap-2 px-1"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowDeleteConfirm(false);
        }}
      >
        {group.isDeleted ? (
          <CollapsibleTrigger asChild>
            <div className="flex cursor-pointer select-none items-center gap-2 truncate font-medium text-sm">
              {isExpanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              <span>{group.name}</span>
            </div>
          </CollapsibleTrigger>
        ) : (
          <div className="flex items-center truncate font-bold">
            <span>{group.name}</span>
          </div>
        )}

        <div
          className={cn(
            "flex items-center gap-1 transition-opacity duration-200",
            !isHovered && !showDeleteConfirm
              ? "pointer-events-none opacity-0"
              : "opacity-100",
          )}
        >
          {!group.isDeleted && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    asChild
                  >
                    <a
                      href={`command:pochi.worktree.openDiff?${encodeURIComponent(JSON.stringify([group.path]))}`}
                    >
                      <GitCompare className="size-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("tasksPage.openWorktreeDiff")}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    asChild
                  >
                    <a
                      href={`command:pochi.worktree.openTerminal?${encodeURIComponent(JSON.stringify([group.path]))}`}
                    >
                      <Terminal className="size-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("tasksPage.openWorktreeInTerminal")}
                </TooltipContent>
              </Tooltip>
              {!group.isMain && (
                <Popover
                  open={showDeleteConfirm}
                  onOpenChange={setShowDeleteConfirm}
                >
                  <Tooltip>
                    <PopoverTrigger asChild>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TooltipTrigger>
                    </PopoverTrigger>
                    <TooltipContent>
                      {t("tasksPage.deleteWorktree")}
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent className="w-80" sideOffset={0}>
                    <div className="flex flex-col gap-3">
                      <div className="space-y-2">
                        <h4 className="font-medium leading-none">
                          {t("tasksPage.deleteWorktreeTitle")}
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          {t("tasksPage.deleteWorktreeConfirm", {
                            name: group.name,
                          })}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          {t("tasksPage.cancel")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          asChild
                          onClick={() => setShowDeleteConfirm(false)}
                        >
                          <a
                            href={`command:pochi.worktree.delete?${encodeURIComponent(JSON.stringify([group.path]))}`}
                          >
                            {t("tasksPage.delete")}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </>
          )}
          {/* {!group.isDeleted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  asChild
                >
                  <a
                    href={`command:pochi.worktree.newTask?${encodeURIComponent(JSON.stringify([group.path]))}`}
                  >
                    <Plus className="size-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tasksPage.newTask")}</TooltipContent>
            </Tooltip>
          )} */}
        </div>
      </div>

      <CollapsibleContent>
        <ScrollArea viewportClassname="max-h-[230px] px-1 py-1">
          {group.tasks.length > 0 ? (
            group.tasks.map((task) => {
              const isRead = !unreadTaskIds.has(task.id);

              return (
                <div key={task.id} className="py-0.5">
                  <TaskRow task={task} isRead={isRead} />
                </div>
              );
            })
          ) : (
            <div className="py-1 text-muted-foreground text-xs">
              {t("tasksPage.emptyState.description")}
            </div>
          )}
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
