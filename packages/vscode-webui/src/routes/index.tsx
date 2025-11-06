import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"; // Import pagination components
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { CreateTaskInput } from "@/features/chat";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { cn } from "@/lib/utils";
import { setActiveStore, vscodeHost } from "@/lib/vscode";
import { getWorktreeNameFromGitDir } from "@getpochi/common/git-utils";
import { parseTitle } from "@getpochi/common/message-utils";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { type Task, taskCatalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Brain,
  CheckCircle2,
  Edit3,
  GitBranch,
  HelpCircle,
  ListTreeIcon,
  TerminalIcon,
  Wrench,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineErrorOutline } from "react-icons/md";
import { LiveStoreTaskProvider } from "../livestore-task-provider";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    return {
      page: Number(search.page ?? 1),
    };
  },
  component: App,
});

const getPaginationItems = (
  currentPage: number,
  totalPages: number,
  onPageChange: (page: number) => void,
) => {
  const items = [];
  const pageLimit = 5; // Max number of page links to show
  const sidePages = 1; // Number of pages to show on each side of current page

  // Previous button
  items.push(
    <PaginationItem key="prev">
      <PaginationPrevious
        onClick={() => onPageChange(currentPage - 1)}
        // @ts-expect-error todo: fix type
        disabled={currentPage <= 1}
        className="px-2 sm:px-2.5"
      />
    </PaginationItem>,
  );

  if (totalPages <= pageLimit) {
    // Show all pages if total pages is less than or equal to limit
    for (let i = 1; i <= totalPages; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => onPageChange(i)}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }
  } else {
    // Show first page
    items.push(
      <PaginationItem key={1}>
        <PaginationLink
          onClick={() => onPageChange(1)}
          isActive={currentPage === 1}
        >
          1
        </PaginationLink>
      </PaginationItem>,
    );

    // Ellipsis after first page if needed
    if (currentPage > sidePages + 2) {
      items.push(
        <PaginationItem key="ellipsis-start">
          <PaginationEllipsis />
        </PaginationItem>,
      );
    }

    // Pages around current page
    const startPage = Math.max(2, currentPage - sidePages);
    const endPage = Math.min(totalPages - 1, currentPage + sidePages);

    for (let i = startPage; i <= endPage; i++) {
      if (i === 1 || i === totalPages) continue; // Skip if it's the first or last page (already handled)
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            onClick={() => onPageChange(i)}
            isActive={currentPage === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>,
      );
    }

    // Ellipsis before last page if needed
    if (currentPage < totalPages - sidePages - 1) {
      items.push(
        <PaginationItem key="ellipsis-end">
          <PaginationEllipsis />
        </PaginationItem>,
      );
    }

    // Show last page
    items.push(
      <PaginationItem key={totalPages}>
        <PaginationLink
          onClick={() => onPageChange(totalPages)}
          isActive={currentPage === totalPages}
        >
          {totalPages}
        </PaginationLink>
      </PaginationItem>,
    );
  }

  // Next button
  items.push(
    <PaginationItem key="next">
      <PaginationNext
        onClick={() => onPageChange(currentPage + 1)}
        // @ts-expect-error todo: fix type
        disabled={currentPage >= totalPages}
        className="px-2 sm:px-2.5"
      />
    </PaginationItem>,
  );

  return items;
};

function App() {
  const { data: currentWorkspace, isFetching: isFetchingWorkspace } =
    useCurrentWorkspace();
  if (isFetchingWorkspace) {
    return;
  }

  if (!currentWorkspace?.cwd) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center">
        <WorkspaceRequiredPlaceholder isFetching={isFetchingWorkspace} />
      </div>
    );
  }

  return (
    <LiveStoreTaskProvider cwd={currentWorkspace.cwd}>
      <Tasks />
    </LiveStoreTaskProvider>
  );
}

function Tasks() {
  const limit = 15;
  const router = useRouter();
  const { page = 1 } = Route.useSearch();
  const { store } = useStore();
  const { data: currentWorkspace } = useCurrentWorkspace();
  const cwd = currentWorkspace?.cwd || "default";
  const workspaceFolder = currentWorkspace?.workspaceFolder;
  const tasks = store.useQuery(taskCatalog.queries.makeTasksQuery(cwd));
  const { data: worktrees } = useWorktrees();
  const totalPages = Math.ceil(tasks.length / limit);
  const paginatedTasks = tasks.slice((page - 1) * limit, page * limit);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (totalPages && newPage > totalPages)) return;
    router.navigate({
      to: "/",
      search: (prev) => ({ ...prev, page: newPage }),
    });
  };

  useEffect(() => {
    setActiveStore(store);
    return () => {
      setActiveStore(null);
    };
  }, [store]);

  const attachmentUpload = useAttachmentUpload();

  return (
    <div className="flex h-screen w-screen flex-col">
      {/* Main content area with scroll */}
      <div className="w-full px-4 pt-3">
        <CreateTaskInput
          cwd={cwd}
          workspaceFolder={workspaceFolder}
          attachmentUpload={attachmentUpload}
        />
      </div>
      {tasks.length === 0 ? (
        <EmptyTaskPlaceholder />
      ) : (
        <div className="min-h-0 flex-1 pt-4">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4 pb-6">
              {paginatedTasks.map((task) => {
                const isWorktreeExist =
                  task.git?.worktree && worktrees
                    ? worktrees.some((wt) => wt.path === task.cwd)
                    : undefined;

                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    worktreeName={getWorktreeNameFromGitDir(
                      task.git?.worktree?.gitdir,
                    )}
                    isWorktreeExist={isWorktreeExist}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Pagination footer */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between px-2 py-2.5 sm:py-3">
          {totalPages > 1 && (
            <div className="mr-2 flex-1 px-3 sm:px-4">
              <Pagination>
                <PaginationContent className="gap-0.5 sm:gap-1">
                  {getPaginationItems(page, totalPages, handlePageChange)}
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyTaskPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full select-none flex-col items-center justify-center p-5 text-center text-gray-500 dark:text-gray-300">
      <h2 className="mb-2 flex items-center gap-3 font-semibold text-2xl text-gray-700 dark:text-gray-100">
        <TerminalIcon />
        {t("tasksPage.emptyState.title")}
      </h2>
      <p className="mb-4 leading-relaxed">
        {t("tasksPage.emptyState.description")}
      </p>
    </div>
  );
}

const TaskStatusIcon = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const iconProps = { className: "size-5 text-muted-foreground" };
  switch (status) {
    case "streaming":
      return (
        <Zap {...iconProps} aria-label={t("tasksPage.status.streaming")} />
      );
    case "pending-tool":
      return (
        <Wrench {...iconProps} aria-label={t("tasksPage.status.pendingTool")} />
      );
    case "pending-input":
      return (
        <Edit3 {...iconProps} aria-label={t("tasksPage.status.pendingInput")} />
      );
    case "completed":
      return (
        <CheckCircle2
          {...iconProps}
          aria-label={t("tasksPage.status.completed")}
        />
      );
    case "failed":
      return (
        <MdOutlineErrorOutline
          {...iconProps}
          aria-label={t("tasksPage.status.failed")}
        />
      );
    case "pending-model":
      return (
        <Brain {...iconProps} aria-label={t("tasksPage.status.pendingModel")} />
      );
    default:
      return (
        <HelpCircle
          {...iconProps}
          aria-label={t("tasksPage.status.unknown", { status })}
        />
      );
  }
};

const getStatusBorderColor = (status: string): string => {
  switch (status) {
    case "streaming":
      return "border-l-muted-foreground/60";
    case "pending-tool":
      return "border-l-muted-foreground/60";
    case "pending-input":
      return "border-l-muted-foreground/60";
    case "completed":
      return "border-l-muted-foreground/30";
    case "failed":
      return "border-l-muted-foreground/80";
    default:
      return "border-l-muted-foreground/50";
  }
};

function TaskRow({
  task,
  worktreeName,
  isWorktreeExist,
}: {
  task: Task;
  worktreeName?: string;
  isWorktreeExist?: boolean;
}) {
  const { jwt } = usePochiCredentials();

  const title = useMemo(() => parseTitle(task.title), [task.title]);

  const content = (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border border-border/50 bg-card transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-md",
        "border-l-4",
        getStatusBorderColor(task.status),
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1 overflow-hidden">
            <GitBadge
              git={task.git}
              worktreeName={worktreeName}
              className="max-w-full text-muted-foreground/80 text-xs"
              isWorktreeExist={isWorktreeExist}
            />
            <h3 className="line-clamp-2 flex-1 font-medium text-foreground leading-relaxed transition-colors duration-200 group-hover:text-foreground/80">
              {title}
            </h3>
          </div>
          <div className="mt-0.5 shrink-0">
            <TaskStatusIcon status={task.status} />
          </div>
        </div>
      </div>
    </div>
  );

  const storeId = encodeStoreId(jwt, task.parentId || task.id);

  const openTaskInPanel = useCallback(() => {
    if (task.cwd) {
      vscodeHost.openTaskInPanel({
        cwd: task.cwd,
        uid: task.id,
        storeId,
      });
    }
  }, [task.cwd, task.id, storeId]);

  return <div onClick={openTaskInPanel}>{content}</div>;
}

function GitBadge({
  className,
  git,
  worktreeName,
  isWorktreeExist,
}: {
  git: Task["git"];
  worktreeName?: string;
  className?: string;
  isWorktreeExist?: boolean;
}) {
  const { t } = useTranslation();
  if (!git?.origin) return null;

  return (
    <Badge
      variant="outline"
      className={cn("border-none p-0 text-foreground", className)}
    >
      {git.branch &&
        !isBranchNameSameAsWorktreeName(git.branch, worktreeName) && (
          <>
            <GitBranch className="shrink-0" />
            <span className="truncate">{git.branch}</span>
          </>
        )}
      {worktreeName && (
        <>
          <ListTreeIcon className="ml-1 shrink-0" />
          <span className="truncate">{worktreeName}</span>
          {isWorktreeExist === false && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 inline-flex">
                  <MdOutlineErrorOutline className="size-4 text-yellow-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                <span>{t("tasksPage.worktreeNotExist")}</span>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </Badge>
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
