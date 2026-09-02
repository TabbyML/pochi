/**
 * ManagePanel — a toolbar trigger opening a drawer that lists the background
 * commands Pochi started for this task, plus its background tasks in dev mode.
 */
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsDevMode } from "@/features/settings";
import { getBackgroundJobStatusLabel } from "@/lib/background-job-status-label";
import { useOpenBackgroundJob } from "@/lib/hooks/use-open-background-job";
import { cn } from "@/lib/utils";
import type { Message, Task } from "@getpochi/livekit";
import {
  ChevronRightIcon,
  ListChevronsDownUpIcon,
  Loader2,
  TerminalIcon,
} from "lucide-react";
import { Children, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobList } from "../hooks/use-job-list";
import type { JobListEntry, JobStatus } from "../lib/build-job-list";
import {
  BackgroundTaskDetail,
  BackgroundTaskRow,
  BackgroundTasksLabel,
  useBackgroundTasks,
} from "./background-task-debug-panel";

export function ManagePanel({
  taskId,
  messages,
}: {
  taskId: string;
  messages: Message[];
}) {
  const { t } = useTranslation();
  const [isDevMode] = useIsDevMode();
  const [isOpen, setIsOpen] = useState(false);
  // Picking a task slides its detail over the list. The list stays mounted
  // underneath, so folded sections and scroll position survive the trip, and
  // the id outlives the closing slide so the layer does not empty mid-flight.
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { pochi } = useJobList(taskId, messages);

  // The badge is the trigger's whole status language: a blue dot appears only
  // while something is actually running.
  const runningCount = pochi.filter((job) => job.status === "running").length;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // Closing the drawer takes it back to the list, so it never reopens
        // deep inside a task nobody asked about again.
        if (!open) {
          setIsDetailOpen(false);
          setDetailTaskId(null);
        }
      }}
    >
      {/* The name of the panel is carried by the tooltip; in the toolbar's
          icon row, the trigger wears the same clothes as its neighbours. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("managePanel.toggle")}
              data-testid="manage-panel-toggle"
              className="button-focus relative h-6 w-6 p-0"
            >
              <ListChevronsDownUpIcon className="size-5" />
              {runningCount > 0 && (
                // Nudged outside the button box: the glyph is `size-5` in a
                // 24px button, so a flush dot lands on top of its chevron.
                <span className="-top-0.5 -right-0.5 absolute size-1.5 rounded-full bg-blue-500" />
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("managePanel.title")}</TooltipContent>
      </Tooltip>
      <SheetContent
        side="right"
        className="flex h-full w-[340px] max-w-[85vw] flex-col p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-3 pr-12">
          <SheetTitle className="font-semibold text-foreground text-sm">
            {t("managePanel.title")}
          </SheetTitle>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {isDevMode === true ? (
            <DevPanelBody
              pochi={pochi}
              onSelectTask={(id) => {
                setDetailTaskId(id);
                setIsDetailOpen(true);
              }}
            />
          ) : (
            <PanelBody pochi={pochi} tasks={NoTasks} />
          )}
          {/* A layer rather than a second page: it slides in over the list and
              back out again, and the list below it is never unmounted. */}
          <div
            data-testid="background-task-layer"
            data-state={isDetailOpen ? "open" : "closed"}
            inert={!isDetailOpen}
            className={cn(
              "absolute inset-0 flex flex-col bg-background transition-transform duration-200 ease-out",
              !isDetailOpen && "pointer-events-none translate-x-full",
            )}
          >
            {detailTaskId !== null && (
              <BackgroundTaskDetail
                taskId={detailTaskId}
                onBack={() => setIsDetailOpen(false)}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const NoTasks: readonly Task[] = [];

/**
 * Background tasks live in a different store than the commands, and only dev
 * mode ever shows them. Reading them from a separate component keeps that
 * query from running for everybody else, since hooks cannot be conditional.
 */
function DevPanelBody({
  pochi,
  onSelectTask,
}: {
  pochi: JobListEntry[];
  onSelectTask: (taskId: string) => void;
}) {
  const tasks = useBackgroundTasks();

  return <PanelBody pochi={pochi} tasks={tasks} onSelectTask={onSelectTask} />;
}

function PanelBody({
  pochi,
  tasks,
  onSelectTask,
}: {
  pochi: JobListEntry[];
  tasks: readonly Task[];
  onSelectTask?: (taskId: string) => void;
}) {
  const { t } = useTranslation();

  // A group with nothing in it says nothing; an empty panel says it once.
  if (pochi.length === 0 && tasks.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-muted-foreground text-sm">
        {t("managePanel.empty")}
      </div>
    );
  }

  return (
    /* One scroll container for the whole panel, so every list here shares the
       VS Code themed scrollbar. */
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-2 p-2">
        {pochi.length > 0 && (
          <PanelGroup label={t("managePanel.pochiGroup")}>
            {pochi.map((job) => (
              <li key={job.backgroundJobId}>
                <JobRow job={job} />
              </li>
            ))}
          </PanelGroup>
        )}
        {tasks.length > 0 && (
          <PanelGroup label={BackgroundTasksLabel}>
            {tasks.map((task) => (
              <li key={task.id}>
                <BackgroundTaskRow
                  task={task}
                  onSelect={() => onSelectTask?.(task.id)}
                />
              </li>
            ))}
          </PanelGroup>
        )}
      </div>
    </ScrollArea>
  );
}

/** How many rows the list shows before it has to be asked for the rest. */
const CollapsedItemCount = 5;

function PanelGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const items = Children.toArray(children);
  const visibleItems = isExpanded ? items : items.slice(0, CollapsedItemCount);

  return (
    <div className="flex flex-col gap-0.5">
      {/* The title row doubles as the collapse control, so there is no extra
          button to aim at, and the count stays visible while folded. */}
      <button
        type="button"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((prev) => !prev)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2 py-1",
          "text-left transition-colors hover:bg-muted/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              !isCollapsed && "rotate-90",
            )}
          />
          {/* No colour override: inheriting the drawer's own foreground keeps
              the title at full contrast instead of the dimmer `--foreground`. */}
          <span className="truncate font-semibold text-sm">{label}</span>
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {items.length}
        </span>
      </button>
      {!isCollapsed && (
        <>
          <ul className="flex flex-col gap-0.5">{visibleItems}</ul>
          {items.length > CollapsedItemCount && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className={cn(
                // Reads as a text link, not a row: only the label brightens on
                // hover, so it never competes with the item rows for attention.
                // Centring the label breaks the rows' left alignment, so it
                // cannot be mistaken for one more item in the list.
                "px-2 py-1 text-center text-muted-foreground text-xs",
                "transition-colors hover:text-foreground",
              )}
            >
              {/* The section header already carries the true total, so the
                  toggle does not repeat it. */}
              {isExpanded ? t("managePanel.seeLess") : t("managePanel.seeMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function JobRow({ job }: { job: JobListEntry }) {
  const { t } = useTranslation();
  const { isTerminalClosed, canOpenOutputFile, open } = useOpenBackgroundJob(
    job.backgroundJobId,
    job.outputFile,
  );
  // Live terminal -> reveal and focus it; gone -> open its recorded output.
  const canOpen = !isTerminalClosed || canOpenOutputFile;

  const label = isTerminalClosed
    ? canOpenOutputFile
      ? t("commandExecutionPanel.terminalClosedOpenOutput")
      : t("commandExecutionPanel.terminalClosed")
    : t("commandExecutionPanel.openJob", {
        displayId: job.displayId ?? job.backgroundJobId,
      });

  const rowClassName =
    "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors";
  const rowContent = (
    <>
      <JobStatusIndicator status={job.status} />
      <span className="min-w-0 flex-1 truncate text-sm">{job.title}</span>
      <JobBadge isActive={job.isActive} inert={!canOpen}>
        {/* A job whose message was compacted away has lost its `%N`. */}
        {job.displayId ? (
          <div className="font-bold font-mono text-[10px]">{job.displayId}</div>
        ) : (
          <TerminalIcon className="size-3" />
        )}
      </JobBadge>
    </>
  );

  const row = canOpen ? (
    <button
      type="button"
      aria-label={label}
      onClick={open}
      className={cn(
        rowClassName,
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      {rowContent}
    </button>
  ) : (
    <div aria-label={label} className={cn(rowClassName, "cursor-default")}>
      {rowContent}
    </div>
  );

  // The hover reveals what the row is about, not what clicking it does: the
  // command, like the panels in the message list, and how it ended, in the
  // same words the notification uses. A running job has neither an ending nor,
  // if its message was compacted away, a command: then there is nothing to add.
  const statusLabel =
    job.status === "running"
      ? undefined
      : getBackgroundJobStatusLabel(job.status, job.exitCode, t);

  if (!job.command && !statusLabel) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent>
        {job.command && (
          <span className="block max-w-sm whitespace-pre-wrap break-words font-mono text-xs">
            {job.command}
          </span>
        )}
        {statusLabel && (
          <span className="mt-1 block text-xs opacity-80">{statusLabel}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The badge on a row. Purely decorative here: the whole row carries the
 * interaction, so it must not be a nested button.
 */
function JobBadge({
  isActive,
  inert,
  children,
}: {
  isActive: boolean;
  inert: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-[16px] shrink-0 items-center justify-center rounded-sm bg-secondary text-secondary-foreground",
        {
          "ring-1 ring-primary": isActive,
          "text-muted-foreground opacity-60": inert,
        },
      )}
    >
      {children}
    </span>
  );
}

/**
 * The status marker in front of a row. A dot carries every resting status;
 * work in progress gets a spinner, which is the only state that has to be
 * recognizable at a glance. Both sit in the same column so titles line up.
 */
function JobStatusIndicator({ status }: { status: JobStatus }) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
      {status === "running" ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : (
        <span
          className={cn("size-1.5 rounded-full", {
            "bg-green-500 dark:bg-green-700": status === "completed",
            "bg-destructive": status === "failed",
            "bg-muted-foreground/50": status === "stopped",
          })}
        />
      )}
    </span>
  );
}
