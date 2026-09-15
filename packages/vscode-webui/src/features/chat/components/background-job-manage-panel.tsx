import { Badge } from "@/components/ui/badge";
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
import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { getSubAgentBackgroundJobId } from "@getpochi/common";
import type { Message, Task } from "@getpochi/livekit";
import type { BackgroundJobEntry, JobStatus } from "@getpochi/livekit";
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  FileTextIcon,
  ListIcon,
  Loader2Icon,
  SquareIcon,
} from "lucide-react";
import { Children, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBackgroundJobList } from "../hooks/use-background-job-list";
import { useBackgroundJobManager } from "../hooks/use-background-job-manager";
import {
  BackgroundTaskDetail,
  isBackgroundTaskRunning,
  useBackgroundTasks,
} from "./background-task-debug-panel";
import { RowStatusIndicator, type RowStatusTone } from "./row-status-indicator";

export function BackgroundJobManagePanel({
  taskId,
  messages,
}: {
  taskId: string;
  messages: Message[];
}) {
  const [isDevMode] = useIsDevMode();

  return isDevMode === true ? (
    <DevManagePanel taskId={taskId} messages={messages} />
  ) : (
    <ManagePanel taskId={taskId} messages={messages} tasks={NoTasks} />
  );
}

const NoTasks: readonly Task[] = [];

/**
 * Background tasks are only shown in dev mode, and hooks cannot be
 * conditional, so their query lives in its own component.
 */
function DevManagePanel({
  taskId,
  messages,
}: {
  taskId: string;
  messages: Message[];
}) {
  const tasks = useBackgroundTasks();

  return <ManagePanel taskId={taskId} messages={messages} tasks={tasks} />;
}

function ManagePanel({
  taskId,
  messages,
  tasks,
}: {
  taskId: string;
  messages: Message[];
  tasks: readonly Task[];
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const cancelDetailOpenRef = useRef<() => void>(undefined);
  const backgroundJobs = useBackgroundJobList(taskId, messages);
  // A subagent can also appear in the dev query; show and count it only once.
  const visibleTasks = tasks.filter(
    (task) => !backgroundJobs.some((job) => job.taskId === task.id),
  );

  useEffect(() => () => cancelDetailOpenRef.current?.(), []);

  const runningCount =
    backgroundJobs.filter((job) => job.status === "running").length +
    visibleTasks.filter((task) => isBackgroundTaskRunning(task.status)).length;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          cancelDetailOpenRef.current?.();
          setIsDetailOpen(false);
          setDetailTaskId(null);
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("managePanel.toggle")}
              data-testid="background-job-manage-panel-toggle"
              className="button-focus relative h-6 w-6 p-0"
            >
              <ListIcon className="size-4.5" />
              {runningCount > 0 && (
                <span className="-top-1 -right-1 absolute flex h-[10px] min-w-[10px] items-center justify-center rounded-full bg-blue-500 px-[2px] font-medium text-[8px] text-white tabular-nums leading-none">
                  {runningCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("managePanel.title")}</TooltipContent>
      </Tooltip>
      <SheetContent
        side="right"
        className="flex h-full w-[340px] max-w-[85vw] flex-col p-0 pt-8"
      >
        <SheetTitle className="sr-only">{t("managePanel.title")}</SheetTitle>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            data-testid="background-job-list-layer"
            inert={isDetailOpen}
            className="flex min-h-0 flex-1 flex-col"
          >
            <PanelBody
              parentTaskId={taskId}
              backgroundJobs={backgroundJobs}
              tasks={visibleTasks}
              onSelectTask={(id) => {
                cancelDetailOpenRef.current?.();
                setDetailTaskId(id);
                // A detail paints its thread a frame late, so sliding right
                // away animates a blank panel and stalls on that render.
                cancelDetailOpenRef.current = afterNextPaint(() =>
                  setIsDetailOpen(true),
                );
              }}
            />
          </div>
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
                backgroundJobId={getSubAgentBackgroundJobId(detailTaskId)}
                showDiagnostics={visibleTasks.some(
                  (task) => task.id === detailTaskId,
                )}
                taskId={detailTaskId}
                isOpen={isDetailOpen}
                onBack={() => {
                  cancelDetailOpenRef.current?.();
                  setIsDetailOpen(false);
                }}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function afterNextPaint(callback: () => void) {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(callback);
  });
  return () => cancelAnimationFrame(frame);
}

function PanelBody({
  parentTaskId,
  backgroundJobs,
  tasks,
  onSelectTask,
}: {
  parentTaskId: string;
  backgroundJobs: BackgroundJobEntry[];
  tasks: readonly Task[];
  onSelectTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const systemTasks = new Map(tasks.map((task) => [task.id, task]));
  const jobs = useRunningFirst([
    ...backgroundJobs,
    ...tasks.map(
      (task): BackgroundJobEntry => ({
        backgroundJobId: getSubAgentBackgroundJobId(task.id),
        taskId: task.id,
        title: task.title || t("backgroundTasks.untitled"),
        status: isBackgroundTaskRunning(task.status)
          ? "running"
          : task.status === "completed"
            ? "completed"
            : task.status === "failed"
              ? task.error?.kind === "AbortError"
                ? "stopped"
                : "failed"
              : "finished",
      }),
    ),
  ]);
  const commands = jobs.filter((job) => !job.taskId);
  const agents = jobs.filter((job) => job.taskId);

  if (backgroundJobs.length === 0 && tasks.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-base text-muted-foreground">
        {t("managePanel.empty")}
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-6 p-2">
        {commands.length > 0 && (
          <PanelGroup label={t("managePanel.pochiGroup")}>
            {commands.map((job) => (
              <li key={job.backgroundJobId}>
                <JobRow job={job} parentTaskId={parentTaskId} />
              </li>
            ))}
          </PanelGroup>
        )}
        {agents.length > 0 && (
          <PanelGroup label={t("backgroundTasks.title")}>
            {agents.map((job) => (
              <li key={job.backgroundJobId}>
                {job.taskId && systemTasks.has(job.taskId) ? (
                  <SystemAgentJobRow
                    job={job}
                    task={systemTasks.get(job.taskId)}
                    onSelect={() => {
                      if (job.taskId) onSelectTask(job.taskId);
                    }}
                  />
                ) : (
                  <AgentJobRow
                    job={job}
                    parentTaskId={parentTaskId}
                    onSelect={() => {
                      if (job.taskId) onSelectTask(job.taskId);
                    }}
                  />
                )}
              </li>
            ))}
          </PanelGroup>
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * Running commands first, the incoming order kept within each half. A row is
 * ranked by the status it had when it first appeared, so a command that stops
 * keeps its place instead of dropping away under the pointer.
 */
function useRunningFirst(jobs: BackgroundJobEntry[]): BackgroundJobEntry[] {
  const ranks = useRef(new Map<string, number>());

  const rankOf = (job: BackgroundJobEntry) => {
    const known = ranks.current.get(job.backgroundJobId);
    if (known !== undefined) return known;
    const rank = job.status === "running" ? 0 : 1;
    ranks.current.set(job.backgroundJobId, rank);
    return rank;
  };

  return [...jobs].sort((a, b) => rankOf(a) - rankOf(b));
}

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
          <span className="truncate font-medium text-muted-foreground text-sm">
            {label}
          </span>
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-all",
              !isCollapsed && "rotate-90",
              isCollapsed
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </span>
        <span className="shrink-0 text-muted-foreground/70 text-sm tabular-nums">
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
                "px-2 py-1 text-center text-muted-foreground text-sm",
                "transition-colors hover:text-foreground",
              )}
            >
              {isExpanded ? t("managePanel.seeLess") : t("managePanel.seeMore")}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** System agents use the same row; diagnostics remain available in dev mode. */
function SystemAgentJobRow({
  job,
  task,
  onSelect,
}: { job: BackgroundJobEntry; task?: Task; onSelect: () => void }) {
  const { t } = useTranslation();
  const { backgroundTaskState } = useBackgroundTaskState(task?.id ?? "");
  const type = backgroundTaskState?.agentType ?? backgroundTaskState?.useCase;
  return (
    <AgentJobRow
      job={{ ...job, agentType: type ?? t("backgroundTasks.systemAgent") }}
      onSelect={onSelect}
      statusLabel={
        task?.status === "pending-input" ? t("backgroundTasks.idle") : undefined
      }
    />
  );
}

function AgentJobRow({
  job,
  parentTaskId,
  onSelect,
  statusLabel,
}: {
  job: BackgroundJobEntry;
  statusLabel?: string;
  parentTaskId?: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const manager = useBackgroundJobManager(parentTaskId ?? "");
  const [error, setError] = useState<string>();
  const summary = [
    job.agentType,
    statusLabel ?? t(`backgroundTasks.${job.status}`),
    job.notificationPending
      ? t("backgroundTasks.pendingNotification")
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div>
      {/* biome-ignore lint/a11y/useSemanticElements: The clickable row contains independent action buttons, which cannot be nested inside a button. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
        className="group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <RowStatusIndicator
          isRunning={job.status === "running"}
          tone={statusTone(job.status)}
        />
        {job.agentType && (
          <Badge variant="secondary" className="h-5 shrink-0 py-0">
            {job.agentType}
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 flex-1 truncate text-sm" title={summary}>
              {job.title}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <span className="block max-w-sm whitespace-pre-wrap break-words text-sm">
              {job.title}
            </span>
            <span className="mt-1 block text-sm opacity-80">{summary}</span>
          </TooltipContent>
        </Tooltip>
        <span className="flex min-h-5 shrink-0 items-center gap-1">
          {job.status === "running" && parentTaskId && (
            <StopJobAction
              onClick={async () => {
                try {
                  await manager.kill(job.backgroundJobId);
                  setError(undefined);
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              }}
            />
          )}
          <ChevronRightIcon
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

function JobRow({
  job,
  parentTaskId,
}: { job: BackgroundJobEntry; parentTaskId: string }) {
  const manager = useBackgroundJobManager(parentTaskId ?? "");
  const [error, setError] = useState<string>();
  const { t } = useTranslation();
  const { backgroundCommands, show, hide } = useBackgroundCommands();
  const isRunning = job.status === "running";
  const isVisible = backgroundCommands?.[job.backgroundJobId]?.isVisible;
  const openOutputFile = () => {
    if (job.outputFile) vscodeHost.openFile(job.outputFile);
  };
  const open = isRunning
    ? () => show?.(job.backgroundJobId)
    : job.outputFile
      ? openOutputFile
      : undefined;

  const statusLabel =
    job.status === "running" || job.status === "finished"
      ? undefined
      : getBackgroundJobStatusLabel(job.status, job.exitCode, t);

  const title = (
    <span className="min-w-0 flex-1 truncate text-sm">{job.title}</span>
  );

  const actions = isRunning ? (
    <>
      <JobAction
        label={
          isVisible
            ? t("managePanel.hideTerminal")
            : t("managePanel.openTerminal")
        }
        onClick={() =>
          isVisible ? hide?.(job.backgroundJobId) : show?.(job.backgroundJobId)
        }
      >
        {isVisible ? (
          <EyeOffIcon className="size-4" />
        ) : (
          <EyeIcon className="size-4" />
        )}
      </JobAction>
      <StopJobAction
        onClick={async () => {
          try {
            await manager.kill(job.backgroundJobId);
            setError(undefined);
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
          }
        }}
      />
    </>
  ) : (
    <>
      {job.outputFile && (
        <JobAction
          label={t("backgroundJobNotifications.openOutput")}
          onClick={openOutputFile}
        >
          <FileTextIcon className="size-4" />
        </JobAction>
      )}
      {job.command && <CopyCommandAction command={job.command} />}
    </>
  );
  const hasActions =
    isRunning || job.outputFile !== undefined || job.command !== undefined;

  return (
    <div
      role={open ? "button" : undefined}
      tabIndex={open ? 0 : undefined}
      onClick={open}
      onKeyDown={
        open
          ? (event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              open();
            }
          : undefined
      }
      className={cn(
        "group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60",
        open &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
      <RowStatusIndicator isRunning={isRunning} tone={statusTone(job.status)} />
      {job.command || statusLabel ? (
        <Tooltip>
          <TooltipTrigger asChild>{title}</TooltipTrigger>
          <TooltipContent>
            {job.command && (
              <span className="block max-w-sm whitespace-pre-wrap break-words font-mono text-sm">
                {job.command}
              </span>
            )}
            {statusLabel && (
              <span className="mt-1 block text-sm opacity-80">
                {statusLabel}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        title
      )}
      <span className="grid min-h-5 shrink-0 items-center justify-items-end">
        {job.displayId && (
          <span
            className={cn(
              // An inline box paints over the controls sharing its grid cell,
              // so it has to opt out of hit-testing.
              "pointer-events-none col-start-1 row-start-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-secondary px-1 font-bold font-mono text-secondary-foreground text-xs",
              isVisible && "ring-1 ring-primary",
              hasActions &&
                "transition-opacity group-focus-within:opacity-0 group-hover:opacity-0",
            )}
          >
            {job.displayId}
          </span>
        )}
        {hasActions && (
          <span className="col-start-1 row-start-1 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            {actions}
          </span>
        )}
      </span>
    </div>
  );
}

function StopJobAction({ onClick }: { onClick: () => Promise<void> }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("backgroundTasks.stop")}
          aria-busy={pending}
          disabled={pending}
          className="size-5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
          onClick={async (event) => {
            event.stopPropagation();
            if (inFlight.current) return;
            inFlight.current = true;
            setPending(true);
            try {
              await onClick();
            } finally {
              inFlight.current = false;
              setPending(false);
            }
          }}
        >
          {pending ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <SquareIcon
              className="size-2.5 fill-current"
              strokeWidth={0}
              aria-hidden="true"
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("backgroundTasks.stop")}</TooltipContent>
    </Tooltip>
  );
}

function JobAction({
  label,
  onClick,
  children,
}: {
  label: string;
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
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          className={cn(
            // The `dark:` twins displace the ghost variant's own dark hover.
            "size-5 rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground dark:hover:bg-foreground/10",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CopyCommandAction({ command }: { command: string }) {
  const { t } = useTranslation();
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });

  return (
    <JobAction
      label={
        isCopied
          ? t("commandExecutionPanel.copied")
          : t("managePanel.copyCommand")
      }
      onClick={() => {
        if (!isCopied) copyToClipboard(command);
      }}
    >
      {isCopied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </JobAction>
  );
}

function statusTone(status: JobStatus): RowStatusTone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  return "muted";
}
