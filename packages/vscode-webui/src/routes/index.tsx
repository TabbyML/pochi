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
import { WelcomeScreen } from "@/components/welcome-screen";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { CreateTaskInput } from "@/features/chat";
import { useTaskReadStatusStore } from "@/features/chat";
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useModelList } from "@/lib/hooks/use-model-list";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { setActiveStore } from "@/lib/vscode";
import { getWorktreeNameFromGitDir } from "@getpochi/common/git-utils";

import { TaskRow } from "@/components/task-row";
import { taskCatalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TerminalIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
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

  const { users, isLoading: isUserLoading } = useUserStorage();
  const { modelList = [], isLoading: isModelListLoading } = useModelList(true);

  if (isFetchingWorkspace || isUserLoading || isModelListLoading) {
    return;
  }

  if (!users?.pochi && modelList.length === 0) {
    return <WelcomeScreen user={users?.pochi} />;
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
  const unreadTaskIds = useTaskReadStatusStore((state) => state.unreadTaskIds);
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
                const isRead = !unreadTaskIds.has(task.id);

                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    worktreeName={getWorktreeNameFromGitDir(
                      task.git?.worktree?.gitdir,
                    )}
                    isWorktreeExist={isWorktreeExist}
                    isRead={isRead}
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
