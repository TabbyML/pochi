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
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { usePochiTasks } from "@/lib/hooks/use-pochi-tasks";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import {
  type GitWorktree,
  prefixWorktreeName,
} from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import {
  ChevronDown,
  ChevronRight,
  GitCompare,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  onDeleteWorktree,
}: {
  tasks: readonly Task[];
  onDeleteWorktree: (worktreePath: string) => void;
}) {
  const { t } = useTranslation();
  const { data: currentWorkspace, isLoading: isLoadingCurrentWorkspace } =
    useCurrentWorkspace();
  const { data: worktrees, isLoading: isLoadingWorktrees } = useWorktrees();
  const [showDeleted, setShowDeleted] = useState(false);
  const { deletingPaths, deleteWorktree } =
    useOptimisticWorktreeDelete(worktrees);

  const groups = useMemo(() => {
    if (isLoadingWorktrees || isLoadingCurrentWorkspace) {
      return [];
    }

    const defaultWorktree: GitWorktree = {
      commit: "",
      path: currentWorkspace?.workspaceFolder ?? "",
      isMain: true,
    };

    const allWorktrees =
      worktrees === undefined || worktrees.length === 0
        ? [defaultWorktree]
        : worktrees;

    const worktreeMap = new Map(allWorktrees.map((wt) => [wt.path, wt]));
    const worktreeIndexMap = new Map(
      allWorktrees.map((wt, index) => [wt.path, index]),
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
      allWorktrees,
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
  }, [
    tasks,
    worktrees,
    isLoadingWorktrees,
    isLoadingCurrentWorkspace,
    currentWorkspace,
  ]);

  // Apply optimistic deletion: filter out items being deleted
  const optimisticGroups = useMemo(() => {
    return groups
      .map((g) => {
        if (deletingPaths.has(g.path)) {
          // If has tasks, mark as deleted; otherwise filter out
          if (g.tasks.length > 0) {
            return { ...g, isDeleted: true };
          }
          return null;
        }
        return g;
      })
      .filter((x): x is WorktreeGroup => x !== null);
  }, [groups, deletingPaths]);

  const activeGroups = optimisticGroups.filter((g) => !g.isDeleted);
  const deletedGroups = optimisticGroups.filter((g) => g.isDeleted);

  const handleDeleteWorktree = (worktreePath: string) => {
    deleteWorktree(worktreePath);
    onDeleteWorktree(worktreePath);
  };

  return (
    <div className="flex flex-col gap-1">
      {activeGroups.map((group) => (
        <WorktreeSection
          key={group.path}
          group={group}
          onDeleteGroup={handleDeleteWorktree}
        />
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
  onDeleteGroup,
}: {
  group: WorktreeGroup;
  onDeleteGroup?: (worktreePath: string) => void;
}) {
  const { t } = useTranslation();
  // Default expanded for existing worktrees, collapsed for deleted
  const [isExpanded, setIsExpanded] = useState(!group.isDeleted);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const pochiTasks = usePochiTasks();

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="mb-3"
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
              <span>{prefixWorktreeName(group.name)}</span>
            </div>
          </CollapsibleTrigger>
        ) : (
          <div className="flex items-center truncate font-bold">
            <span>{prefixWorktreeName(group.name)}</span>
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
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            onDeleteGroup?.(group.path);
                          }}
                        >
                          {t("tasksPage.delete")}
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
              return (
                <div key={task.id} className="py-0.5">
                  <TaskRow task={task} state={pochiTasks[task.id]} />
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

function useOptimisticWorktreeDelete(worktrees: GitWorktree[] | undefined) {
  const [deletingMap, setDeletingMap] = useState<Map<string, number>>(
    new Map(),
  );

  // Clean up deletingMap after successful deletion or when path reappears (new worktree created)
  useEffect(() => {
    if (deletingMap.size === 0) return;

    const currentWorktreePaths = new Set(worktrees?.map((wt) => wt.path) || []);
    let hasChanges = false;
    const updatedMap = new Map(deletingMap);

    for (const [path, timestamp] of deletingMap) {
      const stillExists = currentWorktreePaths.has(path);

      if (!stillExists) {
        // Path no longer exists - deletion completed successfully
        updatedMap.delete(path);
        hasChanges = true;
      } else if (timestamp > 0) {
        // Only check elapsed time if timestamp was set (after deletion promise resolved)
        const elapsedTime = Date.now() - timestamp;
        if (elapsedTime > 5000) {
          // If still exists after 5 seconds, assume it's a new worktree or deletion failed
          updatedMap.delete(path);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      setDeletingMap(updatedMap);
    }
  }, [worktrees, deletingMap]);

  const deleteWorktree = (wt: string) => {
    // Mark as deleting immediately (with timestamp 0 as placeholder)
    setDeletingMap((prev) => new Map(prev).set(wt, 0));

    vscodeHost
      .deleteWorktree(wt)
      .then((success) => {
        if (success) {
          // Start 5-second timer after successful deletion
          setDeletingMap((prev) => new Map(prev).set(wt, Date.now()));
        } else {
          // If deletion failed, immediately remove from deleting state
          setDeletingMap((prev) => {
            const next = new Map(prev);
            next.delete(wt);
            return next;
          });
        }
      })
      .catch((error) => {
        console.error("Failed to delete worktree:", error);
        // Remove from deleting state on error
        setDeletingMap((prev) => {
          const next = new Map(prev);
          next.delete(wt);
          return next;
        });
      });
  };

  // Convert Map to Set for backward compatibility
  const deletingPaths = useMemo(
    () => new Set(deletingMap.keys()),
    [deletingMap],
  );

  return { deletingPaths, deleteWorktree };
}
