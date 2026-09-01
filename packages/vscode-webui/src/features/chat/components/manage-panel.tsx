/**
 * ManagePanel — a toolbar trigger opening a drawer that lists the background
 * commands Pochi started for this task.
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
import { useOpenBackgroundJob } from "@/lib/hooks/use-open-background-job";
import { cn } from "@/lib/utils";
import type { Message } from "@getpochi/livekit";
import {
  ChevronRightIcon,
  ListChevronsDownUpIcon,
  Loader2,
  TerminalIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobList } from "../hooks/use-job-list";
import type { JobListEntry, JobStatus } from "../lib/build-job-list";

export function ManagePanel({
  taskId,
  messages,
}: {
  taskId: string;
  messages: Message[];
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { pochi } = useJobList(taskId, messages);

  // The badge is the trigger's whole status language: a blue dot appears only
  // while something is actually running.
  const runningCount = pochi.filter((job) => job.status === "running").length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
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
        {/* One scroll container for the whole panel, so every list here
            shares the VS Code themed scrollbar. */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {pochi.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                {t("managePanel.empty")}
              </div>
            ) : (
              <JobGroup label={t("managePanel.pochiGroup")} jobs={pochi} />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

/** How many rows the list shows before it has to be asked for the rest. */
const CollapsedItemCount = 5;

function JobGroup({ label, jobs }: { label: string; jobs: JobListEntry[] }) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleJobs = isExpanded ? jobs : jobs.slice(0, CollapsedItemCount);

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
          {jobs.length}
        </span>
      </button>
      {!isCollapsed && (
        <>
          <ul className="flex flex-col gap-0.5">
            {visibleJobs.map((job) => (
              <li key={job.backgroundJobId}>
                <JobRow job={job} />
              </li>
            ))}
          </ul>
          {jobs.length > CollapsedItemCount && (
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
  // command, like the panels in the message list. A job whose command is
  // unknown has nothing to add, so it gets no tooltip at all.
  if (!job.command) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent>
        <span className="block max-w-sm whitespace-pre-wrap break-words font-mono text-xs">
          {job.command}
        </span>
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
