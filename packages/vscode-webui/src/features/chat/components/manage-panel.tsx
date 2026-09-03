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
  CircleStopIcon,
  FileTextIcon,
  ListChevronsDownUpIcon,
  Loader2,
  TerminalIcon,
} from "lucide-react";
import { Children, type ReactNode, useRef, useState } from "react";
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

  // The badge is the trigger's whole status language: a blue count appears
  // only while something is actually running.
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
                // 24px button, so a flush badge lands on top of its chevron.
                // Kept at dot scale — a 12px pill that only grows sideways if
                // the count reaches two digits.
                <span className="-top-1 -right-1 absolute flex h-3 min-w-3 items-center justify-center rounded-full bg-blue-500 px-[3px] font-medium text-[9px] text-white tabular-nums leading-none">
                  {runningCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("managePanel.title")}</TooltipContent>
      </Tooltip>
      {/* The top padding is all that is left of the header: it keeps the list
          clear of the close button, which the drawer places over the content. */}
      <SheetContent
        side="right"
        className="flex h-full w-[340px] max-w-[85vw] flex-col p-0 pt-8"
      >
        {/* The trigger's tooltip names the panel on screen; the title stays
            for screen readers, which the drawer requires anyway. */}
        <SheetTitle className="sr-only">{t("managePanel.title")}</SheetTitle>
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
  const commands = useRunningFirst(pochi);

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
        {commands.length > 0 && (
          <PanelGroup label={t("managePanel.pochiGroup")}>
            {commands.map((job) => (
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

/**
 * Running commands first, the incoming order kept within each half.
 *
 * A row is ranked by the status it had when it first appeared, and never
 * ranked again: a command that stops — because it ended, or because it was
 * just killed from that very row — keeps its place instead of dropping away
 * under the pointer. The ranking lives as long as the open drawer, so the
 * next visit sorts by what is true then.
 */
function useRunningFirst(jobs: JobListEntry[]): JobListEntry[] {
  const ranks = useRef(new Map<string, number>());

  const rankOf = (job: JobListEntry) => {
    const known = ranks.current.get(job.backgroundJobId);
    if (known !== undefined) return known;
    const rank = job.status === "running" ? 0 : 1;
    ranks.current.set(job.backgroundJobId, rank);
    return rank;
  };

  return [...jobs].sort((a, b) => rankOf(a) - rankOf(b));
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
          "group flex items-center justify-between gap-2 rounded-md px-2 py-1",
          "text-left transition-colors hover:bg-muted/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          {/* No colour override: inheriting the drawer's own foreground keeps
              the title at full contrast instead of the dimmer `--foreground`. */}
          <span className="truncate font-semibold text-sm">{label}</span>
          {/* Trailing the title, and quiet until the row is pointed at — the
              titles read as headings rather than as a tree. A folded section
              keeps its arrow out, since that is the only thing on screen
              saying where its rows went. */}
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-all",
              !isCollapsed && "rotate-90",
              isCollapsed
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
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
  const { isTerminalClosed, openTerminal, openOutputFile } =
    useOpenBackgroundJob(job.backgroundJobId, job.outputFile);
  const isRunning = job.status === "running";

  // The hover reveals what the row is about: the command, like the panels in
  // the message list, and how it ended, in the same words the notification
  // uses. A running job has neither an ending nor, if its message was
  // compacted away, a command: then there is nothing to add.
  const statusLabel =
    job.status === "running"
      ? undefined
      : getBackgroundJobStatusLabel(job.status, job.exitCode, t);

  const title = (
    <span className="min-w-0 flex-1 truncate text-sm">{job.title}</span>
  );

  // What the row can be asked to do. A running command can be watched and
  // stopped; a finished one can only be read back, and only if its transcript
  // was kept.
  const actions = isRunning ? (
    <>
      {/* The process outlives its terminal tab, so the tab is only offered
          while there is one to show. */}
      {!isTerminalClosed && (
        <JobAction label={t("managePanel.openTerminal")} onClick={openTerminal}>
          <TerminalIcon className="size-3.5" />
        </JobAction>
      )}
      {/* TODO: kill the process once command execution runs on a pty. */}
      <JobAction label={t("managePanel.kill")} destructive>
        <CircleStopIcon className="size-3.5" />
      </JobAction>
    </>
  ) : (
    job.outputFile && (
      <JobAction
        label={t("backgroundJobNotifications.openOutput")}
        onClick={openOutputFile}
      >
        <FileTextIcon className="size-3.5" />
      </JobAction>
    )
  );
  const hasActions = isRunning || job.outputFile !== undefined;

  return (
    <div className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60">
      <JobStatusIndicator status={job.status} />
      {job.command || statusLabel ? (
        <Tooltip>
          <TooltipTrigger asChild>{title}</TooltipTrigger>
          <TooltipContent>
            {job.command && (
              <span className="block max-w-sm whitespace-pre-wrap break-words font-mono text-xs">
                {job.command}
              </span>
            )}
            {statusLabel && (
              <span className="mt-1 block text-xs opacity-80">
                {statusLabel}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        title
      )}
      {/* One cell at the end of the row, holding the number at rest and the
          controls on hover. Stacking them means the title's truncation point
          never moves, and the row keeps a single trailing column. */}
      <span className="grid min-h-5 shrink-0 items-center justify-items-end">
        {job.displayId && (
          <span
            className={cn(
              "col-start-1 row-start-1 font-mono text-[10px] text-muted-foreground",
              // Only a row with something to press trades its number away.
              hasActions &&
                "transition-opacity group-focus-within:opacity-0 group-hover:opacity-0",
            )}
          >
            {job.displayId}
          </span>
        )}
        {hasActions && (
          // Quiet until asked, the way VS Code's own lists hold their inline
          // actions back — and the keyboard gets them as soon as one is
          // focused rather than having to hover.
          <span className="col-start-1 row-start-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {actions}
          </span>
        )}
      </span>
    </div>
  );
}

/** A control at the end of a row, named by its tooltip. */
function JobAction({
  label,
  destructive,
  onClick,
  children,
}: {
  label: string;
  destructive?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "size-5 rounded-sm text-muted-foreground hover:text-foreground",
            destructive && "hover:text-destructive",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
