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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
import { taskCatalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitCompare,
  GitPullRequest,
  Loader2,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  isDeleted: boolean;
  isMain: boolean;
  createdAt?: number;
  branch?: string;
  data: GitWorktree["data"];
}

export function WorktreeList({
  cwd,
  onDeleteWorktree,
  deletingWorktreePaths,
  stableWorktreePaths,
}: {
  cwd: string;
  deletingWorktreePaths: Set<string>;
  stableWorktreePaths: Set<string>;
  onDeleteWorktree: (worktreePath: string) => void;
}) {
  const { t } = useTranslation();
  const { data: currentWorkspace, isLoading: isLoadingCurrentWorkspace } =
    useCurrentWorkspace();
  const {
    worktrees,
    ghCli,
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

    // 2. Create groups for worktrees without tasks
    const worktreeGroups = R.pipe(
      allWorktrees,
      R.map((wt) => ({
        path: wt.path,
        createdAt: 0,
      })),
      R.groupBy((g) => g.path),
      R.mapValues((groups) => groups[0]),
    );

    // 3. Merge and resolve names/isDeleted
    return R.pipe(
      worktreeGroups,
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
          // mark deleted
          return { ...g, isDeleted: true };
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
          ghCli={ghCli}
          cwd={cwd}
          excludedPaths={Array.from(deletingWorktreePaths)}
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
                ghCli={ghCli}
                gitOriginUrl={gitOriginUrl}
                cwd={cwd}
                excludedPaths={Array.from(stableWorktreePaths)}
              />
            ))}
        </>
      )}
    </div>
  );
}
const pageSize = 10;

function WorktreeSection({
  cwd,
  group,
  onDeleteGroup,
  ghCli,
  gitOriginUrl,
  excludedPaths = [],
}: {
  cwd: string;
  group: WorktreeGroup;
  isLoadingWorktrees: boolean;
  onDeleteGroup?: (worktreePath: string) => void;
  ghCli?: { installed: boolean; authorized: boolean };
  gitOriginUrl?: string | null;
  excludedPaths?: string[];
}) {
  const { t } = useTranslation();
  const { store } = useStore();

  // Default expanded for existing worktrees, collapsed for deleted
  const [isExpanded, setIsExpanded] = useState(!group.isDeleted);
  const [isHovered, setIsHovered] = useState(false);
  const loading = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch paginated tasks with filtering
  const tasks = store.useQuery(
    taskCatalog.queries.makeTasksQuery(
      cwd,
      currentPage,
      pageSize,
      excludedPaths,
    ),
  );

  // Fetch total count
  const countResult = store.useQuery(
    taskCatalog.queries.makeTasksCountQuery(cwd, excludedPaths),
  );

  // 累积的 tasks 状态
  const [accumulatedTasks, setAccumulatedTasks] = useState<typeof tasks>([]);

  const hasMore = useMemo(
    () => accumulatedTasks.length < (countResult[0]?.total || 0),
    [tasks, countResult],
  );
  // 当 tasks 数据变化时，合并到累积的 tasks 中
  useEffect(() => {
    if (tasks.length > 0) {
      setAccumulatedTasks((prev) => {
        // 简单的去重合并：基于 task.id
        const taskIds = new Set(prev.map((t) => t.id));
        const newTasks = tasks.filter((t) => !taskIds.has(t.id));
        const result = [...prev, ...newTasks];
        return result;
      });
    }
    loading.current = false;
  }, [tasks]);
  const loadMore = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setCurrentPage((prev) => prev + 1);
  }, []);

  const pochiTasks = usePochiTasks();
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 使用 Intersection Observer 监听 sentinel 元素
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: "100px",
        threshold: 0.1,
      },
    );

    observer.observe(sentinelRef.current);

    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
    };
  }, [hasMore, loadMore]);

  const pullRequest = group.data?.github?.pullRequest;
  const hasEdit = accumulatedTasks.some(
    (task) =>
      task.lineChanges &&
      (task.lineChanges?.added !== 0 || task.lineChanges?.removed !== 0),
  );

  const prUrl = useMemo(() => {
    if (!gitOriginUrl || !pullRequest?.id) return "#";
    const info = parseGitOriginUrl(gitOriginUrl);
    if (!info) return "#";

    if (info.platform === "gitlab") {
      return `${info.webUrl}/-/merge_requests/${pullRequest.id}`;
    }
    if (info.platform === "bitbucket") {
      return `${info.webUrl}/pull-requests/${pullRequest.id}`;
    }
    return `${info.webUrl}/pull/${pullRequest.id}`;
  }, [gitOriginUrl, pullRequest?.id]);

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
          <div className="flex items-center gap-2 overflow-x-hidden">
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
          </div>

          <div className="mt-[1px] flex-1 overflow-x-hidden">
            {pullRequest ? (
              <PrStatusDisplay
                prNumber={pullRequest.id}
                prUrl={prUrl}
                prChecks={pullRequest.checks}
              />
            ) : hasEdit && !group.isDeleted ? (
              <CreatePrDropdown
                worktreePath={group.path}
                branch={group.branch}
                gitOriginUrl={gitOriginUrl}
                ghCli={ghCli}
              />
            ) : null}
          </div>

          <div
            className={cn(
              "ml-auto flex items-center gap-1 transition-opacity duration-200",
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
      </div>

      <CollapsibleContent>
        <ScrollArea viewportClassname="max-h-[230px] px-1 py-1">
          {accumulatedTasks.length > 0 ? (
            accumulatedTasks.map((task) => {
              return (
                <div key={task.id} className="py-0.5">
                  <TaskRow task={task} state={pochiTasks[task.id]} />
                </div>
              );
            })
          ) : (
            <div className="py-0.5 text-muted-foreground text-xs">
              {t("tasksPage.emptyState.description")}
            </div>
          )}
          {hasMore && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center py-4"
            >
              <div className="text-muted-foreground text-xs">
                Loading more...
              </div>
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
  ghCli,
}: {
  branch?: string;
  worktreePath: string;
  gitOriginUrl?: string | null;
  ghCli?: { installed: boolean; authorized: boolean };
}) {
  const { t } = useTranslation();
  const { selectedModel } = useSelectedModels();

  const isGhCliReady = ghCli?.installed && ghCli?.authorized;
  const ghTooltipMessage = !isGhCliReady
    ? !ghCli?.installed
      ? t("worktree.installGhCli")
      : t("worktree.authGhCli")
    : undefined;

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
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 gap-1">
                <GitPullRequest className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("worktree.createPr")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          className="bg-background text-xs"
          side="right"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DropdownMenuItem
                  onSelect={(e) => {
                    if (!isGhCliReady) {
                      e.preventDefault();
                    } else {
                      onCreatePr();
                    }
                  }}
                  className={cn(
                    !isGhCliReady && "cursor-not-allowed opacity-50",
                  )}
                >
                  {t("worktree.createPr")}
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            {!isGhCliReady && (
              <TooltipContent>{ghTooltipMessage}</TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => {
                  if (!isGhCliReady) {
                    e.preventDefault();
                  } else {
                    onCreatePr(true);
                  }
                }}
                className={cn(!isGhCliReady && "cursor-not-allowed opacity-50")}
              >
                {t("worktree.createDraftPr")}
              </DropdownMenuItem>
            </TooltipTrigger>
            {!isGhCliReady && (
              <TooltipContent>{ghTooltipMessage}</TooltipContent>
            )}
          </Tooltip>
          <DropdownMenuItem asChild disabled={!manualPrUrl}>
            <a href={manualPrUrl} target="_blank" rel="noopener noreferrer">
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
        return <Check className="size-3.5" />;
      case "failure":
      case "failed":
      case "error":
        return <X className="size-3.5" />;
      default:
        return <Loader2 className="size-3.5 scale-85 animate-spin" />;
    }
  };

  const passedCheckCount =
    prChecks && prChecks.length > 0
      ? prChecks.filter(
          (check) => check.state === "success" || check.state === "completed",
        ).length
      : 0;

  const failedCheckCount =
    prChecks && prChecks.length > 0
      ? prChecks.filter(
          (check) =>
            check.state === "failure" ||
            check.state === "failed" ||
            check.state === "error",
        ).length
      : 0;

  const allChecksPassed = prChecks && passedCheckCount === prChecks.length;
  const allChecksFailed = prChecks && failedCheckCount === prChecks.length;

  const getChecksStatusText = (short = false) => {
    if (short) {
      return `${passedCheckCount}/${prChecks?.length || 0}`;
    }
    if (allChecksPassed) {
      return t("worktree.allChecksPassed");
    }
    if (allChecksFailed) {
      return t("worktree.allChecksFailed");
    }
    return t("worktree.checksStatus", {
      passed: passedCheckCount,
      total: prChecks?.length || 0,
    });
  };

  return (
    <div className="flex items-center gap-0.5">
      <a
        href={prUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center"
      >
        <span className="mr-1 text-xs">#{prNumber}</span>
      </a>
      {prChecks && prChecks.length > 0 && (
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <span className="cursor-pointer truncate whitespace-nowrap text-xs">
              <span className="hidden truncate whitespace-nowrap min-[300px]:inline">
                {getChecksStatusText()}
              </span>
              <span className="truncate whitespace-nowrap min-[300px]:hidden">
                {getChecksStatusText(true)}
              </span>
            </span>
          </HoverCardTrigger>
          <HoverCardContent
            className="w-auto min-w-[120px] max-w-[70vw] bg-background p-1"
            side="bottom"
            align="start"
            sideOffset={2}
          >
            <ScrollArea viewportClassname="max-h-32">
              <div className="flex flex-col gap-0.5">
                {prChecks.map((check, index) => (
                  <a
                    key={index}
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <span className="flex-shrink-0">
                      {getCheckIcon(check.state)}
                    </span>
                    <span className="truncate">{check.name}</span>
                  </a>
                ))}
              </div>
            </ScrollArea>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}
