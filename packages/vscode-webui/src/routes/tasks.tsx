import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"; // Import pagination components
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkspaceRequiredPlaceholder } from "@/components/workspace-required-placeholder";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { cn } from "@/lib/utils";
import { parseTitle } from "@getpochi/common/message-utils";
import { type Task, catalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Brain,
  CheckCircle2,
  Edit3,
  GitBranch,
  HelpCircle,
  SquareArrowOutUpRightIcon,
  TerminalIcon,
  Wrench,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MdOutlineErrorOutline } from "react-icons/md";
import { useTranslation } from "react-i18next";
import { useStoreDate } from "../livestore-provider";
import { useSettingsStore } from "@/features/settings";
import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/tasks")({
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

  if (!currentWorkspace) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center">
        <WorkspaceRequiredPlaceholder isFetching={isFetchingWorkspace} />
      </div>
    );
  }

  return <Tasks />;
}

function Tasks() {
  const limit = 20;
  const router = useRouter();
  const { page = 1 } = Route.useSearch();
  const { store } = useStore();
  const { storeDate, setStoreDate } = useStoreDate();
  const { data: cwd = "default" } = useCurrentWorkspace();
  const tasks = store.useQuery(catalog.queries.makeTasksQuery(cwd));
  const totalPages = Math.ceil(tasks.length / limit);
  const paginatedTasks = tasks.slice((page - 1) * limit, page * limit);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (totalPages && newPage > totalPages)) return;
    router.navigate({
      to: "/tasks",
      search: (prev) => ({ ...prev, page: newPage }),
    });
  };

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Main content area with scroll */}
      {tasks.length === 0 ? (
        <EmptyTaskPlaceholder date={storeDate} />
      ) : (
        <div className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4 pb-6">
              {paginatedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  storeDate={storeDate.getTime()}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Pagination footer */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between px-2 py-2.5 sm:py-3">
          <DatePicker date={storeDate} setDate={setStoreDate} />
          {totalPages > 1 && (
            <div className="mr-2 flex-1 px-3 sm:px-4">
              <Pagination>
                <PaginationContent className="gap-0.5 sm:gap-1">
                  {getPaginationItems(page, totalPages, handlePageChange)}
                </PaginationContent>
              </Pagination>
            </div>
          )}
          <OpenInTabButton />
        </div>
      </div>
    </div>
  );
}

function EmptyTaskPlaceholder({ date }: { date: Date }) {
  const { navigate } = useRouter();
  return (
    <div className="flex h-full select-none flex-col items-center justify-center p-5 text-center text-gray-500 dark:text-gray-300">
      <h2 className="mb-2 flex items-center gap-3 font-semibold text-2xl text-gray-700 dark:text-gray-100">
        <TerminalIcon />
        No tasks found for {date.toLocaleDateString()}
      </h2>
      <p className="mb-4 leading-relaxed">
        Create a new task to get started with Pochi
      </p>
      <Button
        onClick={() =>
          navigate({
            to: "/",
            search: { uid: crypto.randomUUID() },
          })
        }
        variant="ghost"
        className="mb-20"
      >
        <Zap className="size-4" />
        Create New Task
      </Button>
    </div>
  );
}

const TaskStatusIcon = ({ status }: { status: string }) => {
  const iconProps = { className: "size-5 text-muted-foreground" };
  switch (status) {
    case "streaming":
      return <Zap {...iconProps} aria-label="Streaming" />;
    case "pending-tool":
      return <Wrench {...iconProps} aria-label="Pending Tool" />;
    case "pending-input":
      return <Edit3 {...iconProps} aria-label="Pending Input" />;
    case "completed":
      return <CheckCircle2 {...iconProps} aria-label="Completed" />;
    case "failed":
      return <MdOutlineErrorOutline {...iconProps} aria-label="Failed" />;
    case "pending-model":
      return <Brain {...iconProps} aria-label="Pending Model" />;
    default:
      return (
        <HelpCircle {...iconProps} aria-label={`Unknown Status: ${status}`} />
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

function TaskRow({ task, storeDate }: { task: Task; storeDate: number }) {
  const title = useMemo(() => parseTitle(task.title), [task.title]);
  return (
    <Link
      to={"/"}
      search={{ uid: task.id, storeDate }}
      className="group cursor-pointer"
    >
      <div
        className={cn(
          "cursor-pointer rounded-lg border border-border/50 bg-card transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-md",
          "border-l-4",
          getStatusBorderColor(task.status),
        )}
      >
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-1 overflow-hidden">
              <GitBadge
                git={task.git}
                className="max-w-full text-muted-foreground/80 text-xs"
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
    </Link>
  );
}

function GitBadge({
  className,
  git,
}: { git: Task["git"]; className?: string }) {
  if (!git?.origin) return null;

  return (
    <Badge
      variant="outline"
      className={cn("border-none p-0 text-foreground", className)}
    >
      <GitBranch className="shrink-0" />
      <span className="truncate">{git.branch}</span>
    </Badge>
  );
}

function OpenInTabButton() {
  const { t } = useTranslation();
  const { openInTab } = useSettingsStore();
  const { data: credentials } = useQuery({
    queryKey: ["pochi-credentials"],
    queryFn: () => vscodeHost.readPochiCredentials(),
  });

  const handleOpenInTab = async () => {
    await vscodeHost.openPochiInNewTab();
  };

  const showOpenInTab = openInTab && credentials;

  if (!showOpenInTab) {
    return <div className="w-6" />;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpenInTab}
            className="button-focus relative mr-2 h-6 w-6 p-0"
          >
            <span className="size-4">
              <SquareArrowOutUpRightIcon className="size-4.5" />
            </span>
          </Button>
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="end"
        sideOffset={6}
        className="!w-auto max-w-sm bg-background px-3 py-1.5 text-xs"
      >
        {t("chat.openInTab")}
      </HoverCardContent>
    </HoverCard>
  );
}

function DatePicker({
  date,
  setDate,
}: { date: Date; setDate: (date: Date) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            id="date"
            className="w-24 justify-between font-normal"
          >
            {date ? date.toLocaleDateString() : "Select date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            captionLayout="dropdown"
            disabled={(date) =>
              date > new Date() || date < new Date("2020-01-01")
            }
            onSelect={(date) => {
              if (date) {
                setDate(date);
                setOpen(false);
              }
            }}
            footer={
              <div className="mt-2 flex justify-end px-2 py-1">
                <Button
                  variant="outline"
                  className="h-7 px-2 py-0 text-xs"
                  onClick={() => {
                    setDate(new Date());
                    setOpen(false);
                  }}
                >
                  Today
                </Button>
              </div>
            }
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
