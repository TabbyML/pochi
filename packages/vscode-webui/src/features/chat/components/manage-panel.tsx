/**
 * ManagePanel — the docked overview of everything running alongside the
 * conversation: Pochi's background commands for this task.
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
import { ListChevronsDownUpIcon, TerminalIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobList } from "../hooks/use-job-list";
import type { JobListEntry, JobStatus } from "../lib/build-job-list";
import { PanelSection, useCappedList } from "./panel-section";
import { StatusDot, StatusSpinner } from "./status-dot";

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

function JobGroup({ label, jobs }: { label: string; jobs: JobListEntry[] }) {
  const { visibleItems, seeMoreButton } = useCappedList(jobs);

  return (
    <PanelSection label={label} count={jobs.length}>
      <ul className="flex flex-col gap-0.5">
        {visibleItems.map((job) => (
          <li key={job.backgroundJobId}>
            <JobRow job={job} />
          </li>
        ))}
      </ul>
      {seeMoreButton}
    </PanelSection>
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
  // command, like the panels in the message list. A terminal that has run
  // nothing has nothing to add, so it gets no tooltip at all.
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

function JobStatusIndicator({ status }: { status: JobStatus }) {
  if (status === "running") return <StatusSpinner />;

  return (
    <StatusDot
      className={cn({
        "bg-green-500 dark:bg-green-700": status === "completed",
        "bg-destructive": status === "failed",
        "bg-muted-foreground/50": status === "stopped" || status === "idle",
      })}
    />
  );
}
