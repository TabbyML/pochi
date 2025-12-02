import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import {
  type GitWorktree,
  prefixWorktreeName,
} from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  GitBranch,
  GitCompare,
  GitPullRequestCreate,
  GitPullRequestDraft,
  Loader2,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { TaskRow } from "./task-row";
import { ScrollArea } from "./ui/scroll-area";

interface PrCheck {
  name: string;
  state: string;
  url: string;
}

interface WorktreeGroup {
  name: string;
  path: string;
  tasks: Task[];
  isDeleted: boolean;
  isMain: boolean;
  createdAt?: number;
  branch?: string;
  // PR related fields (to be populated from GitHub API)
  prNumber?: number;
  prUrl?: string;
  prStatus?: "open" | "closed" | "merged";
  prChecks?: PrCheck[];
}

export function WorktreeList({
  tasks,
  onDeleteWorktree,
  deletingWorktreePaths,
}: {
  tasks: readonly Task[];
  deletingWorktreePaths: Set<string>;
  onDeleteWorktree: (worktreePath: string) => void;
}) {
  const { t } = useTranslation();
  const { data: currentWorkspace, isLoading: isLoadingCurrentWorkspace } =
    useCurrentWorkspace();
  const { data: worktrees, isLoading: isLoadingWorktrees } = useWorktrees();
  const [showDeleted, setShowDeleted] = useState(false);

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
          branch: wt?.branch,
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
        if (deletingWorktreePaths.has(g.path)) {
          // If has tasks, mark as deleted; otherwise filter out
          if (g.tasks.length > 0) {
            return { ...g, isDeleted: true };
          }
          return null;
        }
        return g;
      })
      .filter((x): x is WorktreeGroup => x !== null);
  }, [groups, deletingWorktreePaths]);

  const activeGroups = optimisticGroups.filter((g) => !g.isDeleted);
  const deletedGroups = optimisticGroups.filter((g) => g.isDeleted);

  // TODO: Remove mock data - Add mock PR data for testing
  const activeGroupsWithMock = activeGroups.map((group, index) => {
    if (index === 1) {
      // Second worktree: open PR with all checks passed
      return {
        ...group,
        prNumber: 3,
        prUrl: "https://github.com/TabbyML/pochi/pull/3",
        prStatus: "open" as const,
        prChecks: [
          { name: "CI", state: "success", url: "https://github.com" },
          { name: "Lint", state: "success", url: "https://github.com" },
          { name: "Test", state: "success", url: "https://github.com" },
        ],
      };
    }
    if (index === 2) {
      // Third worktree: open PR with checks in progress
      return {
        ...group,
        prNumber: 5,
        prUrl: "https://github.com/TabbyML/pochi/pull/5",
        prStatus: "open" as const,
        prChecks: [
          { name: "CI", state: "pending", url: "https://github.com" },
          { name: "Lint", state: "success", url: "https://github.com" },
          { name: "Test", state: "in_progress", url: "https://github.com" },
        ],
      };
    }
    if (index === 3) {
      // Fourth worktree: open PR with failed checks
      return {
        ...group,
        prNumber: 7,
        prUrl: "https://github.com/TabbyML/pochi/pull/7",
        prStatus: "open" as const,
        prChecks: [
          { name: "CI", state: "failure", url: "https://github.com" },
          { name: "Lint", state: "success", url: "https://github.com" },
          { name: "Test", state: "failure", url: "https://github.com" },
        ],
      };
    }
    return group;
  });
  return (
    <div className="flex flex-col gap-1">
      {activeGroupsWithMock.map((group) => (
        <WorktreeSection
          isLoadingWorktrees={isLoadingWorktrees}
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
              <WorktreeSection
                isLoadingWorktrees={isLoadingWorktrees}
                key={group.path}
                group={group}
              />
            ))}
        </>
      )}
    </div>
  );
}

function WorktreeSection({
  group,
  isLoadingWorktrees,
  onDeleteGroup,
}: {
  group: WorktreeGroup;
  isLoadingWorktrees: boolean;
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
        className="group px-1"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowDeleteConfirm(false);
        }}
      >
        {/* worktree name & branch */}
        <div className="flex h-6 items-center gap-2">
          <div className="flex flex-1 items-center gap-3 overflow-x-hidden">
            {group.isDeleted ? (
              <CollapsibleTrigger asChild>
                <div className="flex w-full flex-1 cursor-pointer select-none items-center gap-2 font-medium text-sm">
                  {isExpanded ? (
                    <ChevronDown className="size-4 shrink-0" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0" />
                  )}
                  <span className="truncate">
                    {prefixWorktreeName(group.name)}
                  </span>
                </div>
              </CollapsibleTrigger>
            ) : (
              <div className="flex items-center font-bold">
                <span className="truncate">
                  {prefixWorktreeName(group.name)}
                </span>
              </div>
            )}
            {!!group.branch &&
              !isBranchNameSameAsWorktreeName(group.branch, group.name) && (
                <span className="flex flex-1 items-center gap-1 truncate text-sm">
                  <GitBranch className="size-3 shrink-0" />
                  <span className="truncate">{group.branch}</span>
                </span>
              )}
          </div>

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
          </div>
        </div>
        {/* PR status */}
        <div className="mt-1 flex flex-nowrap items-center gap-5 overflow-x-hidden">
          {/* TODO: Integrate with actual PR data from GitHub */}
          <div className={cn("shrink-0")}>
            {group.prNumber && group.prStatus === "open" ? (
              <PrStatusDisplay
                prNumber={group.prNumber}
                prUrl={group.prUrl ?? ""}
                prChecks={group.prChecks}
              />
            ) : (
              <CreatePrDropdown branch={group.branch} />
            )}
          </div>{" "}
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

// Component A: Split button for creating PRs
function CreatePrDropdown({ branch }: { branch?: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center">
      {/* Left button - Direct PR creation */}
      <Button
        variant="ghost"
        size="sm"
        className="!px-1 -ml-1 h-6 gap-1 rounded-r-none border-r-0"
      >
        <GitPullRequestCreate className="size-4" />
        <span className="text-xs">{t("worktree.createPr")}</span>
      </Button>
      {/* Right button - Dropdown menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-5 rounded-l-none px-0"
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuItem asChild>
            <a
              href={`command:pochi.pr.createDraft?${encodeURIComponent(JSON.stringify([branch]))}`}
              className="gap-1.5"
            >
              <GitPullRequestDraft className="size-3" />
              {t("worktree.createDraftPr")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={`command:pochi.pr.createManually?${encodeURIComponent(JSON.stringify([branch]))}`}
              className="gap-1.5"
            >
              <ExternalLink className="size-3" />
              {t("worktree.createPrManually")}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Component B: Display PR status with merge button
function PrStatusDisplay({
  prNumber,
  prUrl,
  prChecks,
}: {
  prNumber: number;
  prUrl: string;
  prChecks?: PrCheck[];
}) {
  const { t } = useTranslation();
  const [showChecks, setShowChecks] = useState(false);

  // Helper function to get check icon
  const getCheckIcon = (state: string) => {
    switch (state) {
      case "success":
      case "completed":
        return <CheckCircle2 className="size-3" />;
      case "failure":
      case "failed":
      case "error":
        return <XCircle className="size-3" />;
      case "pending":
      case "queued":
        return <Circle className="size-3" />;
      case "in_progress":
        return <Loader2 className="size-3 animate-spin" />;
      default:
        return <Circle className="size-3" />;
    }
  };

  // Check if all checks are passed
  const allChecksPassed =
    prChecks && prChecks.length > 0
      ? prChecks.every(
          (check) => check.state === "success" || check.state === "completed",
        )
      : false;

  const hasPendingChecks =
    prChecks && prChecks.length > 0
      ? prChecks.some(
          (check) =>
            check.state === "pending" ||
            check.state === "in_progress" ||
            check.state === "queued",
        )
      : false;

  const hasFailedChecks =
    prChecks && prChecks.length > 0
      ? prChecks.some(
          (check) =>
            check.state === "failure" ||
            check.state === "failed" ||
            check.state === "error",
        )
      : false;

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="!px-1 h-auto gap-0.5 hover:bg-transparent"
        asChild
      >
        <a href={prUrl} target="_blank" rel="noopener noreferrer">
          <span className="font-medium text-xs">
            {t("worktree.prNumber", { number: prNumber })}
          </span>
          <ExternalLink className="size-3" />
        </a>
      </Button>
      {allChecksPassed && (
        <span className="text-xs">{t("worktree.readyToMerge")}</span>
      )}
      {hasPendingChecks && !hasFailedChecks && (
        <span className="text-xs">{t("worktree.checksInProgress")}</span>
      )}
      {hasFailedChecks && (
        <span className="text-xs">{t("worktree.checksFailed")}</span>
      )}
      {/* Dropdown button for checks */}
      {prChecks && prChecks.length > 0 && (
        <Popover open={showChecks} onOpenChange={setShowChecks}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto w-4 p-0 hover:bg-transparent"
            >
              <ChevronDown className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start" sideOffset={4}>
            <div className="space-y-1">
              {prChecks.map((check, index) => (
                <a
                  key={index}
                  href={check.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded p-1.5 text-sm hover:bg-accent"
                >
                  {getCheckIcon(check.state)}
                  <span className="flex-1 truncate">{check.name}</span>
                  <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function isBranchNameSameAsWorktreeName(
  branch: string | undefined,
  worktreeName: string | undefined,
): boolean {
  if (!branch || !worktreeName) return false;
  // https://github.com/microsoft/vscode/blob/9092ce3427fdd0f677333394fb10156616090fb5/extensions/git/src/commands.ts#L3512
  return branch.replace(/\//g, "-") === worktreeName;
}
