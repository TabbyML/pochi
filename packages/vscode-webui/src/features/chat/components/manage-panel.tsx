/**
 * ManagePanel — the docked overview of everything running alongside the
 * conversation: Pochi's background commands for this task, the user's open
 * terminals, and (in dev mode) the background task list.
 *
 * The component is deliberately unaware of where it sits; `page.tsx` owns the
 * positioning so the panel can later move into a column of its own.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsDevMode } from "@/features/settings";
import { useOpenBackgroundJob } from "@/lib/hooks/use-open-background-job";
import { cn } from "@/lib/utils";
import type { Message } from "@getpochi/livekit";
import { ListIcon, TerminalIcon } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobList } from "../hooks/use-job-list";
import type { JobListEntry, JobStatus } from "../lib/build-job-list";
import {
  BackgroundTaskDetail,
  BackgroundTaskDetailTestId,
  BackgroundTaskList,
} from "./background-task-debug-panel";
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
  const [isDevMode] = useIsDevMode();
  const [isOpen, setIsOpen] = useState(false);
  const [debugTaskId, setDebugTaskId] = useState<string | null>(null);
  const { pochi, terminals } = useJobList(taskId, messages);

  // The badge is the trigger's whole status language: a number appears only
  // while something is actually running, so no badge means nothing is working.
  const runningCount = [...pochi, ...terminals].filter(
    (job) => job.status === "running",
  ).length;

  // A category with nothing in it says nothing, so it is left out entirely and
  // the separators are placed between whatever is left.
  const sections: { key: string; node: ReactNode }[] = [];
  if (pochi.length > 0) {
    sections.push({
      key: "pochi",
      node: <JobGroup label={t("managePanel.pochiGroup")} jobs={pochi} />,
    });
  }
  if (terminals.length > 0) {
    sections.push({
      key: "terminals",
      node: (
        <JobGroup label={t("managePanel.terminalsGroup")} jobs={terminals} />
      ),
    });
  }
  if (isDevMode === true) {
    sections.push({
      key: "tasks",
      node: (
        <BackgroundTaskList
          selectedTaskId={debugTaskId}
          onSelect={setDebugTaskId}
        />
      ),
    });
  }

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        {/* The name of the panel is carried by the tooltip; on a header row
            that already holds the task title, an icon is quieter. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("managePanel.toggle")}
                data-testid="manage-panel-toggle"
                className={cn(
                  // The button floats above the conversation, so it needs an
                  // opaque fill of its own; anything translucent shows the
                  // message text through it.
                  "relative flex size-8 items-center justify-center rounded-full border bg-background",
                  "transition-colors hover:bg-accent",
                )}
              >
                <ListIcon className="size-4.5" />
                {runningCount > 0 && (
                  <span className="-top-1 -right-1 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums">
                    {runningCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("managePanel.title")}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={6}
          // The height cap and the padding live on the ScrollArea inside, so
          // the themed scrollbar sits flush against the popover edge.
          className="w-[280px] overflow-hidden p-0"
          // The detail drawer is rendered outside the popover, so clicking it
          // must not be treated as dismissing the panel.
          onInteractOutside={(event) => {
            const target = event.target as Element | null;
            if (
              target?.closest?.(`[data-testid="${BackgroundTaskDetailTestId}"]`)
            ) {
              event.preventDefault();
            }
          }}
        >
          {/* One scroll container for the whole panel, so every list here
              shares the VS Code themed scrollbar. */}
          <ScrollArea viewportClassname="max-h-[60vh]">
            <div className="p-1">
              {sections.length === 0 ? (
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                  {t("managePanel.empty")}
                </div>
              ) : (
                sections.map((section, index) => (
                  <Fragment key={section.key}>
                    {index > 0 && <SectionSeparator />}
                    {section.node}
                  </Fragment>
                ))
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {/*
        Rendered outside the popover: its content is positioned by Floating UI
        with a transform, which would break the drawer's fixed positioning.
        The drawer portals itself to <body> so it also escapes this panel's
        stacking context and can paint above the popover.
      */}
      {debugTaskId && (
        <BackgroundTaskDetail
          taskId={debugTaskId}
          onClose={() => setDebugTaskId(null)}
        />
      )}
    </>
  );
}

/** Separates two categories; inside a category, spacing does the grouping. */
function SectionSeparator() {
  return <div className="mx-2 my-3 border-t" />;
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
  const { liveTerminal, isTerminalClosed, canOpenOutputFile, open } =
    useOpenBackgroundJob(job.backgroundJobId, job.outputFile);
  const isUserTerminal = job.backgroundJobId.startsWith("term-");
  // Live terminal -> reveal and focus it; gone -> open its recorded output.
  const canOpen = !isTerminalClosed || canOpenOutputFile;

  const label = isTerminalClosed
    ? canOpenOutputFile
      ? t("commandExecutionPanel.terminalClosedOpenOutput")
      : t("commandExecutionPanel.terminalClosed")
    : isUserTerminal
      ? t("commandExecutionPanel.openTerminal", {
          name: liveTerminal?.name ?? job.title,
        })
      : t("commandExecutionPanel.openJob", {
          displayId: job.displayId ?? job.backgroundJobId,
        });

  const rowClassName =
    "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors";
  const rowContent = (
    <>
      <JobStatusIndicator status={job.status} />
      {/* A terminal opened seconds ago has no name and no command yet; the
          same fallback the command panels use keeps the row readable. */}
      <span className="min-w-0 flex-1 truncate text-sm">
        {job.title || t("commandExecutionPanel.userTerminal")}
      </span>
      <JobBadge isActive={job.isActive} inert={!canOpen}>
        {isUserTerminal || !job.displayId ? (
          <TerminalIcon className="size-3" />
        ) : (
          <div className="font-bold font-mono text-[10px]">{job.displayId}</div>
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
