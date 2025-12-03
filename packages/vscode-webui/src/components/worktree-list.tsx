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
import { useSelectedModels } from "@/features/settings";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { usePochiTasks } from "@/lib/hooks/use-pochi-tasks";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import {
  getWorktreeNameFromWorktreePath,
  parseGitOriginUrl,
} from "@getpochi/common/git-utils";
import {
  type GitWorktree,
  prefixWorktreeName,
} from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ExternalLink,
  GitBranch,
  GitCompare,
  GitPullRequestCreate,
  GitPullRequestDraft,
  Loader2,
  Terminal,
  Trash2,
  X,
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
  data: GitWorktree["data"];
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
  const {
    worktrees,
    gitOriginUrl,
    isLoading: isLoadingWorktrees,
  } = useWorktrees();
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
          data: wt?.data,
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

  return (
    <div className="flex flex-col gap-1">
      {activeGroups.map((group) => (
        <WorktreeSection
          isLoadingWorktrees={isLoadingWorktrees}
          key={group.path}
          group={group}
          onDeleteGroup={onDeleteWorktree}
          gitOriginUrl={gitOriginUrl}
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
                gitOriginUrl={gitOriginUrl}
              />
            ))}
        </>
      )}
    </div>
  );
}

function WorktreeSection({
  group,
  onDeleteGroup,
  gitOriginUrl,
}: {
  group: WorktreeGroup;
  isLoadingWorktrees: boolean;
  onDeleteGroup?: (worktreePath: string) => void;
  gitOriginUrl?: string | null;
}) {
  const { t } = useTranslation();
  // Default expanded for existing worktrees, collapsed for deleted
  const [isExpanded, setIsExpanded] = useState(!group.isDeleted);
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const pochiTasks = usePochiTasks();

  const pullRequest = group.data?.github?.pullRequest;

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
        {!group.isDeleted && (
          <div className="mt-1 flex flex-nowrap items-center gap-5 overflow-x-hidden">
            {/* TODO: Integrate with actual PR data from GitHub */}
            <div className={cn("shrink-0")}>
              {pullRequest && pullRequest.status === "open" ? (
                <PrStatusDisplay
                  prNumber={pullRequest.id}
                  prUrl={pullRequest.url}
                  prChecks={pullRequest.checks}
                />
              ) : (
                <CreatePrDropdown
                  worktreePath={group.path}
                  branch={group.branch}
                  gitOriginUrl={gitOriginUrl}
                />
              )}
            </div>{" "}
          </div>
        )}
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
function CreatePrDropdown({
  worktreePath,
  branch,
  gitOriginUrl,
}: { branch?: string; worktreePath: string; gitOriginUrl?: string | null }) {
  const { t } = useTranslation();
  const { selectedModel } = useSelectedModels();

  const onCreatePr = (isDraft?: boolean) => {
    if (!selectedModel) {
      // FIXME toast tips?
      return;
    }
    const prompt = prompts.createPr(isDraft);
    vscodeHost.openTaskInPanel({
      cwd: worktreePath,
      storeId: undefined,
      prompt,
    });
  };

  const manualPrUrl = useMemo(() => {
    if (!gitOriginUrl || !branch) return undefined;
    const info = parseGitOriginUrl(gitOriginUrl);
    if (!info) return undefined;

    switch (info.platform) {
      case "github":
        return `${info.webUrl}/compare/${branch}?expand=1`;
      case "gitlab":
        return `${info.webUrl}/-/merge_requests/new?merge_request[source_branch]=${branch}`;
      case "bitbucket":
        return `${info.webUrl}/pull-requests/new?source=${branch}`;
      default:
        return info.webUrl;
    }
  }, [gitOriginUrl, branch]);

  return (
    <div className="flex items-center">
      {/* Left button - Direct PR creation */}
      <Button
        variant="ghost"
        size="sm"
        className="!px-1 -ml-1 h-6 gap-1 rounded-r-none border-r-0"
        onClick={() => onCreatePr()}
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
          <DropdownMenuItem onClick={() => onCreatePr(true)}>
            <GitPullRequestDraft className="size-3" />
            {t("worktree.createDraftPr")}
          </DropdownMenuItem>
          <DropdownMenuItem asChild disabled={!manualPrUrl}>
            <a href={manualPrUrl} target="_blank" rel="noopener noreferrer">
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

  // Helper function to get check icon
  const getCheckIcon = (state: string) => {
    switch (state) {
      case "success":
      case "completed":
        return <Check className="size-4" />;
      case "failure":
      case "failed":
      case "error":
        return <X className="size-4" />;
      case "pending":
      case "queued":
        return <CircleDot className="size-4" />;
      case "in_progress":
        return <Loader2 className="size-4 animate-spin" />;
      default:
        return <CircleDot className="size-4" />;
    }
  };

  // Check if all checks are passed
  const allChecksPassed = prChecks
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
    <div className="flex items-center gap-2">
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
      {/* Display checks inline */}
      {prChecks && prChecks.length > 0 && (
        <div className="ml-2 flex items-center gap-1">
          {prChecks.map((check, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <a
                  href={check.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  {getCheckIcon(check.state)}
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <span className="text-xs">{check.name}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
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
