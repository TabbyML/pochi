/**
 * UI proposal: one "open" rule for background jobs across every surface.
 *
 *   running + terminal view  -> open the terminal
 *   running, no terminal     -> open the output file (e.g. Windows)
 *   finished / closed        -> open the output file
 *
 * Each job has exactly one entry point per surface for that action: the badge
 * on a chat card and the row in the manage panel. Notifications only display
 * results, and the separate "open output file" icons go away.
 *
 * The stories cover every job type (background command, promoted command,
 * monitor, user terminal), every lifecycle state, and every UI scenario
 * (start / read / stop cards, notifications, manage panel). Each scenario
 * renders the real, current component next to a mock of the proposal built
 * from the same primitives. Clicks are captured in the action log.
 */
import {
  BackgroundJobNotificationItems,
  BackgroundJobNotifications,
} from "@/components/message/background-job-notifications";
import { SubagentResultNotificationItem } from "@/components/message/subagent-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { NotificationTypeIconClassName } from "@/components/ui/notification-row";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BackgroundJobContextProvider,
  useBackgroundJobInfo,
} from "@/features/chat";
import { getBackgroundJobStatusLabel } from "@/lib/background-job-status-label";
import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useVisibleTerminals } from "@/lib/hooks/use-visible-terminals";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import {
  type BackgroundCommandNotification,
  type BackgroundJobNotification,
  type BackgroundMonitorNotification,
  type BackgroundSubagentNotification,
  createBackgroundJobNotification,
  parseBackgroundJobId,
} from "@getpochi/common";
import {
  type BackgroundJobEntry,
  BackgroundJobManager,
  type Message,
} from "@getpochi/livekit";
import { signal } from "@preact/signals-core";
import type { Meta, StoryObj } from "@storybook/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  SquareIcon,
  TerminalIcon,
} from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { JobRow } from "../../chat/components/background-job-manage-panel";
import { RowStatusIndicator } from "../../chat/components/row-status-indicator";
import { ToolInvocationPart } from "../components";
import {
  BackgroundJobPanel,
  CommandPanelContainer,
  CopyCommandButton,
} from "../components/command-execution-panel";
import { HighlightedText } from "../components/highlight-text";
import { StatusIcon } from "../components/status-icon";
import { ExpandableToolContainer } from "../components/tool-container";
import type { UIToolPart } from "../components/types";

// ---------------------------------------------------------------------------
// Scenario dimensions
// ---------------------------------------------------------------------------

type JobState =
  | "running"
  | "runningVisible"
  | "noTerminal"
  | "completed"
  | "failed"
  | "stopped";
type FinishedStatus = "completed" | "failed" | "stopped";
type JobType = "command" | "promoted" | "monitor" | "terminal";

const JobStates: JobState[] = [
  "running",
  "runningVisible",
  "noTerminal",
  "completed",
  "failed",
  "stopped",
];

const StateInfo: Record<
  JobState,
  {
    short: string;
    label: string;
    finished?: FinishedStatus;
    exitCode?: number;
  }
> = {
  running: { short: "运行中", label: "终端标签页未打开" },
  runningVisible: {
    short: "运行中·终端已打开",
    label: "终端标签页已打开（用户终端为当前终端）",
  },
  noTerminal: {
    short: "运行中·无终端",
    label: "没有终端视图（Windows child_process）",
  },
  completed: {
    short: "成功",
    label: "exit 0",
    finished: "completed",
    exitCode: 0,
  },
  failed: { short: "失败", label: "exit 1", finished: "failed", exitCode: 1 },
  stopped: {
    short: "被停止",
    label: "killBackgroundJob / ■",
    finished: "stopped",
  },
};

const TaskId = "story-background-job-proposal";
const OutputDir = "/Users/meng/.pochi/background-jobs";

interface JobSpec {
  type: Exclude<JobType, "terminal">;
  id: string;
  displayId: string;
  command: string;
  outputFile: string;
  monitor?: string;
}

// Display ids follow the order the jobs start in the conversation.
const Jobs = {
  command: {
    type: "command",
    id: "bgjob-cmd-proposal-eval",
    displayId: "%1",
    command:
      "bun run .evals/core-qa/run.ts --variant baseline --reps 5 --timeout-s 180",
    outputFile: `${OutputDir}/bgjob-cmd-proposal-eval.log`,
  },
  promoted: {
    type: "promoted",
    id: "bgjob-cmd-proposal-test",
    displayId: "%2",
    command: "bun turbo test:integration",
    outputFile: `${OutputDir}/bgjob-cmd-proposal-test.log`,
  },
  monitor: {
    type: "monitor",
    id: "bgjob-monitor-proposal-errors",
    displayId: "%3",
    command: "tail -f logs/dev.log | grep --line-buffered ERROR",
    monitor: "errors in dev.log",
    outputFile: `${OutputDir}/bgjob-monitor-proposal-errors.log`,
  },
} satisfies Record<string, JobSpec>;

/**
 * A job the host tracks for this task but whose start card is not in the
 * conversation, so it has no display id.
 */
const UntrackedJob: JobSpec = {
  type: "command",
  id: "bgjob-cmd-proposal-untracked",
  displayId: "未编号命令",
  command: "bun run build --watch",
  outputFile: `${OutputDir}/bgjob-cmd-proposal-untracked.log`,
};
const JobList: JobSpec[] = [
  Jobs.command,
  Jobs.promoted,
  Jobs.monitor,
  UntrackedJob,
];

const UserTerminal = {
  id: "term-proposal-dev",
  name: "dev server",
  lastCommand: "bun dev",
  outputFile: "/Users/meng/.pochi/terminals/term-proposal-dev.log",
};

const isRunningState = (state: JobState) => !StateInfo[state].finished;

const jobById = (id: string) => JobList.find((job) => job.id === id);

// ---------------------------------------------------------------------------
// Conversation fixtures
// ---------------------------------------------------------------------------

const backgroundCommandPart = {
  type: "tool-executeCommand",
  toolCallId: "tool_proposal_background_command",
  state: "output-available",
  input: { command: Jobs.command.command, background: true },
  output: {
    output: `Background job started.\nJob ID: "${Jobs.command.id}"`,
    isTruncated: false,
    _meta: {
      backgroundJobId: Jobs.command.id,
      outputFile: Jobs.command.outputFile,
    },
  },
} as UIToolPart<"executeCommand">;

const promotedCommandPart = {
  type: "tool-executeCommand",
  toolCallId: "tool_proposal_promoted_command",
  state: "output-available",
  input: { command: Jobs.promoted.command },
  output: {
    output: `Command is still running; continued in background.\nJob ID: "${Jobs.promoted.id}"`,
    isTruncated: false,
    _meta: {
      backgroundJobId: Jobs.promoted.id,
      outputFile: Jobs.promoted.outputFile,
    },
  },
} as UIToolPart<"executeCommand">;

const startMonitorPart = {
  type: "tool-startMonitor",
  toolCallId: "tool_proposal_start_monitor",
  state: "output-available",
  input: { command: Jobs.monitor.command, description: Jobs.monitor.monitor },
  output: {
    backgroundJobId: Jobs.monitor.id,
    outputFile: Jobs.monitor.outputFile,
  },
} as UIToolPart<"startMonitor">;

const JobOutputPreview =
  "[core-qa] case 12/40 passed\n[core-qa] case 13/40 passed\n[core-qa] case 14/40 failed: timeout";
const TerminalOutputPreview =
  "$ bun dev\n  VITE ready in 412 ms\n  ➜  Local: http://localhost:5173/";

const readJobOutputPart = {
  type: "tool-readFile",
  toolCallId: "tool_proposal_read_job_output",
  state: "output-available",
  input: { path: Jobs.command.outputFile },
  output: {
    type: "text",
    content: JobOutputPreview,
    isTruncated: false,
    filePath: Jobs.command.outputFile,
  },
} as UIToolPart<"readFile">;

const readTerminalPart = {
  type: "tool-readFile",
  toolCallId: "tool_proposal_read_terminal",
  state: "output-available",
  input: { path: UserTerminal.outputFile },
  output: {
    type: "text",
    content: TerminalOutputPreview,
    isTruncated: false,
    filePath: UserTerminal.outputFile,
    _meta: {
      terminalName: UserTerminal.name,
      lastCommand: UserTerminal.lastCommand,
    },
  },
} as UIToolPart<"readFile">;

const killJobPart = {
  type: "tool-killBackgroundJob",
  toolCallId: "tool_proposal_kill_job",
  state: "output-available",
  input: { backgroundJobId: Jobs.command.id },
  output: { success: true },
} as UIToolPart<"killBackgroundJob">;

const messages = [
  {
    id: "proposal-assistant-message",
    role: "assistant",
    parts: [
      backgroundCommandPart,
      promotedCommandPart,
      startMonitorPart,
      readJobOutputPart,
      readTerminalPart,
      killJobPart,
    ],
  },
] as unknown as Message[];

function buildJobEntry(
  job: JobSpec,
  state: JobState,
): Extract<BackgroundJobEntry, { kind: "command" }> {
  const { finished, exitCode } = StateInfo[state];
  return {
    kind: "command",
    backgroundJobId: job.id,
    title: job.monitor ?? job.command,
    command: job.command,
    ...(job.monitor ? { monitor: job.monitor } : {}),
    status: finished ?? "running",
    exitCode,
    outputFile: job.outputFile,
  };
}

// ---------------------------------------------------------------------------
// Fake host + action log
// ---------------------------------------------------------------------------

const ActionLogContext = createContext<(entry: string) => void>(() => {});
const useActionLog = () => useContext(ActionLogContext);

const fileName = (path: string) => path.split("/").pop() ?? path;
const describeJob = (id: string) =>
  jobById(id)?.displayId ??
  (id === UserTerminal.id ? `"${UserTerminal.name}"` : id);

/**
 * Seeds the host-backed queries for the given state and routes every host
 * call the panels make into the action log.
 */
function ScenarioHost({
  state,
  onStateChange,
  children,
}: {
  state: JobState;
  onStateChange: (state: JobState) => void;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const store = useDefaultStore();
  const [entries, setEntries] = useState<string[]>([]);
  const log = useCallback(
    (entry: string) => setEntries((prev) => [entry, ...prev].slice(0, 4)),
    [],
  );

  const running = isRunningState(state);
  const detachable = state !== "noTerminal";
  const isVisible = state === "runningVisible";

  // Seeded before the children render so they never see a loading state.
  useMemo(() => {
    queryClient.setQueryData(["backgroundCommands"], {
      backgroundCommands: signal(
        running
          ? Object.fromEntries(
              JobList.map((job) => [
                job.id,
                {
                  taskId: TaskId,
                  command: job.command,
                  monitor: job.monitor,
                  outputFile: job.outputFile,
                  isVisible: isVisible && detachable,
                  detachable,
                },
              ]),
            )
          : {},
      ),
      show: async (id: string) =>
        log(
          detachable
            ? `show(${describeJob(id)}) → 打开终端`
            : `show(${describeJob(id)}) → 没有终端视图，宿主改为打开输出文件`,
        ),
      hide: async (id: string) => log(`hide(${describeJob(id)}) → 隐藏终端`),
      close: async () => {},
    });
    queryClient.setQueryData(["visibleTerminals"], {
      // The user terminal lives as long as the scenario is "running"; job
      // terminals are listed only while their tab is open.
      terminals: signal(
        running
          ? [
              {
                name: UserTerminal.name,
                isActive: isVisible,
                backgroundJobId: UserTerminal.id,
              },
              ...(isVisible && detachable
                ? JobList.map((job) => ({
                    name: job.command,
                    isActive: false,
                    backgroundJobId: job.id,
                  }))
                : []),
            ]
          : [],
      ),
      openBackgroundJobTerminal: async (id: string) =>
        log(`openBackgroundJobTerminal(${describeJob(id)}) → 聚焦终端`),
    });
  }, [queryClient, running, detachable, isVisible, log]);

  useEffect(() => {
    const originalOpenFile = vscodeHost.openFile;
    vscodeHost.openFile = async (path) => {
      log(`openFile(${fileName(path)}) → 打开输出文件`);
    };
    return () => {
      vscodeHost.openFile = originalOpenFile;
    };
  }, [log]);

  // The current manage panel stops jobs through the manager.
  useEffect(() => {
    const manager = BackgroundJobManager.forStore(store);
    manager.connect({
      kill: async (id) => log(`kill(${describeJob(id)}) → 停止任务`),
      observeCommands: async (update) => {
        update(
          running
            ? Object.fromEntries(
                JobList.map((job) => [
                  job.id,
                  {
                    taskId: TaskId,
                    command: job.command,
                    monitor: job.monitor,
                    isVisible: isVisible && detachable,
                    outputFile: job.outputFile,
                  },
                ]),
              )
            : {},
        );
        return { dispose() {} };
      },
      observeNotifications: async () => ({
        dispose() {},
        acknowledge: async () => {},
      }),
    });
    void manager.watchTask(TaskId);
    return () => {
      void manager.dispose();
    };
  }, [store, running, isVisible, detachable, log]);

  return (
    <ActionLogContext.Provider value={log}>
      <BackgroundJobContextProvider messages={messages}>
        <div className="flex flex-col gap-4 p-3">
          <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs backdrop-blur">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-muted-foreground">状态：</span>
              {JobStates.map((option) => (
                <Button
                  key={option}
                  size="xs"
                  variant={option === state ? "default" : "outline"}
                  className="h-6 px-2 text-xs"
                  onClick={() => onStateChange(option)}
                >
                  {StateInfo[option].short}
                </Button>
              ))}
              <span className="ml-1 text-muted-foreground">
                {StateInfo[state].label}
              </span>
            </div>
            <div className="text-muted-foreground">
              点击结果：
              {entries.length === 0 ? (
                <span className="opacity-70">点击任意徽标、按钮或行</span>
              ) : (
                <ul className="mt-0.5 flex flex-col gap-0.5 font-mono">
                  {entries.map((entry, index) => (
                    <li
                      key={`${index}-${entry}`}
                      className={cn(index === 0 && "text-foreground")}
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 border-t pt-1.5 font-medium text-sm">
              <span>现状</span>
              <span className="text-primary">建议</span>
            </div>
          </div>
          {children}
        </div>
      </BackgroundJobContextProvider>
    </ActionLogContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function SurfaceSection({
  title,
  changes,
  children,
}: {
  title: string;
  changes: string[];
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-base">{title}</h3>
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground text-xs">
          {changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      </div>
      {children}
    </section>
  );
}

/** One scenario: the real component on the left, the proposal on the right. */
function Scenario({
  title,
  current,
  proposed,
}: {
  title: string;
  current: ReactNode;
  proposed: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-medium text-sm">{title}</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0 rounded-md border border-dashed p-2">
          {current}
        </div>
        <div className="min-w-0 rounded-md border border-primary/60 p-2">
          {proposed}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposed building blocks
// ---------------------------------------------------------------------------

type OpenTarget = "terminal" | "output";

/**
 * The single rule every surface would share: a running job with a terminal
 * view (or a user terminal that is still open) opens that terminal; anything
 * else opens the output file.
 */
function useProposedOpenTarget(jobId: string, outputFile?: string) {
  const { backgroundCommands, show } = useBackgroundCommands();
  const { terminals, openBackgroundJobTerminal } = useVisibleTerminals();
  const isUserTerminal = parseBackgroundJobId(jobId) === "terminal";
  const command = backgroundCommands?.[jobId];
  const liveTerminal = terminals?.find((tm) => tm.backgroundJobId === jobId);
  const isRunning = isUserTerminal
    ? liveTerminal !== undefined
    : command !== undefined;
  const hasTerminal = isUserTerminal || command?.detachable !== false;
  const target: OpenTarget | undefined =
    isRunning && hasTerminal ? "terminal" : outputFile ? "output" : undefined;
  const open = () => {
    if (target === "terminal") {
      if (isUserTerminal) void openBackgroundJobTerminal?.(jobId);
      else void show?.(jobId);
    } else if (target === "output" && outputFile) {
      void vscodeHost.openFile(outputFile);
    }
  };
  return { isRunning, isActive: liveTerminal?.isActive ?? false, target, open };
}

const openLabel = (target: OpenTarget, name: string) =>
  target === "terminal" ? `Open terminal ${name}` : `View output ${name}`;

const targetHint = (target: OpenTarget | undefined) =>
  target === "terminal"
    ? "打开终端"
    : target === "output"
      ? "打开输出文件"
      : "无可打开内容";

function ProposedBadge({
  label,
  isActive,
  onClick,
  children,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          aria-label={label}
          className={cn("size-[16px] rounded-sm ring-primary", {
            "ring-1": isActive,
          })}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProposedIconAction({
  label,
  onClick,
  compact,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Manage panel rows use the smaller 20px action. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size={compact ? "icon" : "xs"}
          variant="ghost"
          aria-label={label}
          className={cn(
            compact &&
              "size-5 rounded-sm text-muted-foreground hover:bg-foreground/10 hover:text-foreground dark:hover:bg-foreground/10",
          )}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProposedStopAction({
  jobId,
  compact,
}: {
  jobId: string;
  compact?: boolean;
}) {
  const log = useActionLog();
  return (
    <ProposedIconAction
      label={`Stop ${describeJob(jobId)}`}
      onClick={() => log(`kill(${describeJob(jobId)}) → 停止任务`)}
      compact={compact}
    >
      <SquareIcon className="size-3.5 fill-current" strokeWidth={0} />
    </ProposedIconAction>
  );
}

function ExpandOutputButton({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <ProposedIconAction
      label={expanded ? "Collapse" : "Expand"}
      onClick={onToggle}
    >
      {expanded ? (
        <ChevronsDownUpIcon className="size-4" />
      ) : (
        <ChevronsUpDownIcon className="size-4" />
      )}
    </ProposedIconAction>
  );
}

/**
 * Every chat card scenario: one badge (the only way to open the job), the
 * title, and actions that never repeat the open action.
 */
function ProposedToolCard({
  tool,
  heading,
  jobId,
  outputFile,
  panelTitle,
  copyText,
  output,
  showsJobRunning,
}: {
  tool: UIToolPart;
  heading: ReactNode;
  jobId: string;
  outputFile: string;
  panelTitle: string;
  copyText?: string;
  /** Read cards keep their transcript preview. */
  output?: string;
  /** Cards that start the job spin in the status slot while it runs. */
  showsJobRunning?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { isRunning, isActive, target, open } = useProposedOpenTarget(
    jobId,
    outputFile,
  );
  const isUserTerminal = parseBackgroundJobId(jobId) === "terminal";
  const name = describeJob(jobId);

  return (
    <div className="flex flex-col gap-1">
      <ExpandableToolContainer
        title={
          <>
            <StatusIcon
              tool={tool}
              isExecuting={false}
              statusOverride={
                showsJobRunning && isRunning
                  ? { status: "running", label: t("backgroundTasks.running") }
                  : undefined
              }
            />
            <span className="ml-2">{heading}</span>
          </>
        }
        detail={
          <CommandPanelContainer
            icon={
              target && (
                <div className="flex shrink-0 items-center gap-2 self-start">
                  <ProposedBadge
                    label={openLabel(target, name)}
                    isActive={isActive}
                    onClick={open}
                  >
                    {isUserTerminal ? (
                      <TerminalIcon className="size-3" />
                    ) : (
                      <div className="font-bold font-mono text-[10px]">
                        {name}
                      </div>
                    )}
                  </ProposedBadge>
                </div>
              )
            }
            title={panelTitle}
            expanded={output !== undefined && expanded}
            output={output}
            actions={
              <>
                {output && (
                  <ExpandOutputButton
                    expanded={expanded}
                    onToggle={() => setExpanded((prev) => !prev)}
                  />
                )}

                {copyText && <CopyCommandButton command={copyText} />}
              </>
            }
          />
        }
      />
      <span className="pl-1 text-[11px] text-muted-foreground">
        ↳ 点击 {isUserTerminal ? "终端徽标" : name} → {targetHint(target)}
      </span>
    </div>
  );
}

/**
 * A manage panel row laid out like a notification row:
 * [%N or type icon] [title] [status ↔ action]. The row itself is the only way
 * to open the job; the trailing slot shows the spinner / status dot and swaps
 * to [■] (running) or [copy] (finished) on hover.
 */
function ProposedJobRow({
  job,
  entry,
}: {
  job: JobSpec;
  entry: Extract<BackgroundJobEntry, { kind: "command" }>;
}) {
  const { t } = useTranslation();
  const { isRunning, target, open } = useProposedOpenTarget(
    job.id,
    job.outputFile,
  );
  const statusTone =
    entry.status === "completed"
      ? "success"
      : entry.status === "failed"
        ? "danger"
        : "muted";

  return (
    // biome-ignore lint/a11y/useSemanticElements: mirrors JobRow, which nests action buttons.
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") open();
      }}
      className="group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-muted/60"
    >
      {/* Identity slot, same as notification rows: %N, or the type icon. */}
      <span className={NotificationTypeIconClassName}>
        <NotificationJobNumber
          jobId={job.id}
          fallback={
            job.monitor ? (
              <Activity className="size-3" />
            ) : (
              <TerminalIcon className="size-3" />
            )
          }
        />
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
        </TooltipTrigger>
        <TooltipContent>
          <span className="block max-w-sm whitespace-pre-wrap break-words font-mono text-sm">
            {entry.command}
          </span>
          {entry.status !== "running" && (
            <span className="mt-1 block text-sm opacity-80">
              {getBackgroundJobStatusLabel(entry.status, entry.exitCode, t)}
            </span>
          )}
          {target && (
            <span className="mt-1 block text-sm opacity-80">
              Click to {openLabel(target, job.displayId).toLowerCase()}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
      {/* State slot: shows the status at rest and swaps to the action on hover. */}
      <span className="inline-flex size-5 shrink-0 items-center justify-center">
        <span className="inline-flex group-focus-within:hidden group-hover:hidden">
          <RowStatusIndicator isRunning={isRunning} tone={statusTone} />
        </span>
        <span className="hidden group-focus-within:inline-flex group-hover:inline-flex">
          {isRunning ? (
            <ProposedStopAction compact jobId={job.id} />
          ) : (
            <ProposedIconAction
              compact
              label="Copy command"
              onClick={() => navigator.clipboard?.writeText(job.command)}
            >
              <CopyIcon className="size-4" />
            </ProposedIconAction>
          )}
        </span>
      </span>
    </div>
  );
}

function PanelFrame({
  groups,
}: { groups: { label: string; rows: ReactNode[] }[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-background p-2">
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="font-medium text-muted-foreground text-sm">
                {group.label}
              </span>
              <span className="text-muted-foreground/70 text-sm tabular-nums">
                {group.rows.length}
              </span>
            </div>
            <ul className="flex flex-col gap-0.5">{group.rows}</ul>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ChatCardSection({ state }: { state: JobState }) {
  const { t } = useTranslation();
  return (
    <SurfaceSection
      title="① 对话中的工具卡片"
      changes={[
        "去掉 FileText 按钮，徽标（%N / 终端图标）是唯一打开入口",
        "启动卡片（后台命令 / 转后台 / Monitor）在任务运行中时，头部状态位显示真实 spinner；结束后恢复现状图标",
        "停止卡片的 %1 在任务停止后仍能打开输出文件（现状置灰）",
      ]}
    >
      <Scenario
        title="executeCommand (background) · %1"
        current={
          <ToolInvocationPart tool={backgroundCommandPart} isLoading={false} />
        }
        proposed={
          <ProposedToolCard
            tool={backgroundCommandPart}
            heading={t("toolInvocation.backgroundExecute")}
            jobId={Jobs.command.id}
            outputFile={Jobs.command.outputFile}
            panelTitle={Jobs.command.command}
            copyText={Jobs.command.command}
            showsJobRunning
          />
        }
      />
      <Scenario
        title="executeCommand 超时转后台 · %2"
        current={
          <ToolInvocationPart tool={promotedCommandPart} isLoading={false} />
        }
        proposed={
          <ProposedToolCard
            tool={promotedCommandPart}
            heading={
              <>
                {t("toolInvocation.startedCommand")}
                {t("toolInvocation.promotedToBackground")}
              </>
            }
            jobId={Jobs.promoted.id}
            outputFile={Jobs.promoted.outputFile}
            panelTitle={Jobs.promoted.command}
            copyText={Jobs.promoted.command}
            showsJobRunning
          />
        }
      />
      <Scenario
        title="startMonitor · %3"
        current={
          <ToolInvocationPart tool={startMonitorPart} isLoading={false} />
        }
        proposed={
          <ProposedToolCard
            tool={startMonitorPart}
            heading={
              <>
                {t("toolInvocation.startMonitor")}{" "}
                <HighlightedText>{Jobs.monitor.monitor}</HighlightedText>
              </>
            }
            jobId={Jobs.monitor.id}
            outputFile={Jobs.monitor.outputFile}
            panelTitle={Jobs.monitor.command}
            copyText={Jobs.monitor.command}
            showsJobRunning
          />
        }
      />
      <Scenario
        title="readFile(后台任务输出) · %1"
        current={
          <ToolInvocationPart tool={readJobOutputPart} isLoading={false} />
        }
        proposed={
          <ProposedToolCard
            tool={readJobOutputPart}
            heading={t("toolInvocation.readBackground")}
            jobId={Jobs.command.id}
            outputFile={Jobs.command.outputFile}
            panelTitle={Jobs.command.command}
            copyText={Jobs.command.command}
            output={JobOutputPreview}
          />
        }
      />
      <Scenario
        title="readFile(用户终端输出)"
        current={
          <ToolInvocationPart tool={readTerminalPart} isLoading={false} />
        }
        proposed={
          <ProposedToolCard
            tool={readTerminalPart}
            heading={t("toolInvocation.readTerminal")}
            jobId={UserTerminal.id}
            outputFile={UserTerminal.outputFile}
            panelTitle={`${UserTerminal.name} · ${UserTerminal.lastCommand}`}
            copyText={UserTerminal.lastCommand}
            output={TerminalOutputPreview}
          />
        }
      />
      {/* Stopping a job only ever leaves it stopped. */}
      {state === "stopped" && (
        <Scenario
          title="killBackgroundJob · %1"
          current={<ToolInvocationPart tool={killJobPart} isLoading={false} />}
          proposed={
            <ProposedToolCard
              tool={killJobPart}
              heading={t("toolInvocation.stopBackgroundJob")}
              jobId={Jobs.command.id}
              outputFile={Jobs.command.outputFile}
              panelTitle={Jobs.command.command}
              copyText={Jobs.command.command}
            />
          }
        />
      )}
    </SurfaceSection>
  );
}

function commandNotification(
  job: JobSpec,
  status: FinishedStatus,
  { exitCode, error }: { exitCode?: number; error?: string } = {},
): BackgroundCommandNotification {
  return createBackgroundJobNotification({
    taskId: TaskId,
    backgroundJobId: job.id,
    command: job.command,
    status,
    exitCode,
    error,
    outputFile: job.outputFile,
    finishedAt: 1,
  });
}

function monitorBatch(
  index: number,
  lines: string[],
  extra: Partial<BackgroundMonitorNotification> = {},
): BackgroundMonitorNotification {
  return {
    kind: "monitor",
    notificationId: `${Jobs.monitor.id}:${index}`,
    backgroundJobId: Jobs.monitor.id,
    description: Jobs.monitor.monitor ?? "",
    command: Jobs.monitor.command,
    outputFile: Jobs.monitor.outputFile,
    lines,
    ...extra,
  };
}

const MonitorEvents = [
  monitorBatch(1, ["ERROR [api] request timed out after 30000ms"]),
  monitorBatch(2, ["ERROR [db] connection reset by peer"]),
];

const SubagentNotification: BackgroundSubagentNotification = {
  kind: "subagent",
  notificationId: "bgjob-task-proposal-explore:done",
  backgroundJobId: "bgjob-task-proposal-explore",
  taskId: "proposal-explore",
  agentType: "explore",
  title: "Find where background job notifications are rendered",
  status: "completed",
  result: "Notifications are rendered in `background-job-notifications.tsx`.",
};

const NotificationCases: {
  title: string;
  /** What the current row does when clicked. */
  current: string;
  /** What the proposed row does when clicked. */
  proposed: string;
  notifications: BackgroundJobNotification[];
}[] = [
  {
    title: "命令成功 · %1 (exit 0)",
    current: "点击行 → 打开输出文件",
    proposed: "编号对应启动卡片；点击行 → 打开输出文件",
    notifications: [
      commandNotification(Jobs.command, "completed", { exitCode: 0 }),
    ],
  },
  {
    title: "命令失败 · %2 (exit 1)",
    current: "点击行 → 打开输出文件",
    proposed: "编号对应启动卡片；点击行 → 打开输出文件",
    notifications: [
      commandNotification(Jobs.promoted, "failed", { exitCode: 1 }),
    ],
  },
  {
    title: "命令启动失败 · 无 exit code，摘要带错误信息",
    current: "点击行 → 打开输出文件",
    proposed: "编号对应启动卡片；点击行 → 打开输出文件",
    notifications: [
      commandNotification(Jobs.command, "failed", {
        error: "spawn bun ENOENT",
      }),
    ],
  },
  {
    title: "命令被停止 · %1",
    current: "点击行 → 打开输出文件",
    proposed: "编号对应启动卡片；点击行 → 打开输出文件",
    notifications: [commandNotification(Jobs.command, "stopped")],
  },
  {
    title: "旧版持久化通知 · 没有 command 字段，从摘要还原",
    current: "点击行 → 打开输出文件",
    proposed: "编号对应启动卡片；点击行 → 打开输出文件",
    notifications: [
      {
        ...commandNotification(Jobs.promoted, "completed", { exitCode: 0 }),
        command: undefined,
      },
    ],
  },
  {
    title: "Monitor 事件 · %3 运行中，多批事件合并为一组",
    current: "点击行 → 展开事件",
    proposed: "编号对应启动卡片；点击行 → 展开事件",
    notifications: MonitorEvents,
  },
  {
    title: "Monitor 事件 · 有省略的行",
    current: "点击行 → 展开事件",
    proposed: "编号对应启动卡片；点击行 → 展开事件",
    notifications: [
      monitorBatch(3, ["ERROR [api] 502 bad gateway"], { omittedLines: 128 }),
    ],
  },
  {
    title: "Monitor 结束 · 退出 (exit 0)",
    current: "点击行 → 展开事件",
    proposed: "编号对应启动卡片；点击行 → 展开事件",
    notifications: [
      ...MonitorEvents,
      monitorBatch(4, [], {
        ended: {
          reason: "Monitor exited with code 0",
          status: "completed",
          exitCode: 0,
        },
      }),
    ],
  },
  {
    title: "Monitor 结束 · 失败 (exit 1)",
    current: "点击行 → 展开事件",
    proposed: "编号对应启动卡片；点击行 → 展开事件",
    notifications: [
      monitorBatch(5, ["grep: logs/dev.log: No such file or directory"], {
        ended: {
          reason: "Monitor exited with code 1",
          status: "failed",
          exitCode: 1,
        },
      }),
    ],
  },
  {
    title: "Monitor 结束 · 被停止",
    current: "点击行 → 展开事件",
    proposed: "编号对应启动卡片；点击行 → 展开事件",
    notifications: [
      ...MonitorEvents,
      monitorBatch(6, [], {
        ended: { reason: "Monitor was stopped", status: "stopped" },
      }),
    ],
  },
  {
    title: "后台 subagent 结果（参照，不在本方案范围）",
    current: "点击徽标 → 任务详情；点击行 → 展开结果",
    proposed: "不变",
    notifications: [SubagentNotification],
  },
];

function NotificationSection() {
  // What one message typically carries: each job finishes once.
  const mixed: BackgroundJobNotification[] = [
    commandNotification(Jobs.command, "completed", { exitCode: 0 }),
    commandNotification(Jobs.promoted, "failed", { exitCode: 1 }),
    ...MonitorEvents,
    SubagentNotification,
  ];
  return (
    <SurfaceSection
      title="② 后台任务通知"
      changes={[
        "命令 / Monitor 通知用任务编号（%N）替换类型图标，与启动卡片的徽标对应",
        "命令结束通知点击行打开输出文件：通知到达时任务已结束，与统一规则一致（行为同现状）",
        "Monitor 分组仍可展开，subagent 结果保持不变",
        "通知不随顶部状态切换，固定展示所有类型",
      ]}
    >
      {NotificationCases.map((item) => (
        <Scenario
          key={item.title}
          title={item.title}
          current={
            <NotificationFrame hint={item.current}>
              <BackgroundJobNotificationItems
                notifications={item.notifications}
              />
            </NotificationFrame>
          }
          proposed={
            <NotificationFrame hint={item.proposed}>
              <ProposedNotificationItems notifications={item.notifications} />
            </NotificationFrame>
          }
        />
      ))}
      <Scenario
        title="同一条消息里的多种通知（完整通知区块）"
        current={<BackgroundJobNotifications notifications={mixed} />}
        proposed={<ProposedNotificationsBlock notifications={mixed} />}
      />
    </SurfaceSection>
  );
}

/**
 * The job's display id (%N) in the type-icon slot, matching the badge on the
 * card that started the job. Untracked jobs keep the type icon.
 */
function NotificationJobNumber({
  jobId,
  fallback,
}: {
  jobId: string;
  fallback: ReactNode;
}) {
  const info = useBackgroundJobInfo(jobId);
  if (!info?.command) return fallback;
  return (
    <span className="font-bold font-mono text-[10px]">{info.displayId}</span>
  );
}

/**
 * Same grouping and rows as `BackgroundJobNotificationItems`, with the job
 * number in place of the type icon and command rows that are display-only.
 */
function ProposedNotificationItems({
  notifications,
}: {
  notifications: BackgroundJobNotification[];
}) {
  const items: (
    | Exclude<BackgroundJobNotification, BackgroundMonitorNotification>
    | BackgroundMonitorNotification[]
  )[] = [];
  const monitors = new Map<string, BackgroundMonitorNotification[]>();
  for (const notification of notifications) {
    if (notification.kind !== "monitor") {
      items.push(notification);
      continue;
    }
    let group = monitors.get(notification.backgroundJobId);
    if (!group) {
      group = [];
      monitors.set(notification.backgroundJobId, group);
      items.push(group);
    }
    group.push(notification);
  }

  return items.map((item) => {
    if (Array.isArray(item)) {
      const notification = item[0];
      const ended = item.findLast((batch) => batch.ended)?.ended;
      return (
        <BackgroundJobPanel
          key={notification.backgroundJobId}
          backgroundJobId={notification.backgroundJobId}
          appearance="notification"
          command={notification.command}
          notificationIcon={
            <NotificationJobNumber
              jobId={notification.backgroundJobId}
              fallback={<Activity className="size-3" />}
            />
          }
          notificationTitle={
            notification.description?.trim() ||
            notification.command?.trim() ||
            notification.backgroundJobId
          }
          notificationEvents={item.map((batch) => ({
            id: batch.notificationId,
            text: [
              ...(batch.omittedLines
                ? [
                    `[${batch.omittedLines} monitor events omitted; read the output file for full output]`,
                  ]
                : []),
              ...batch.lines,
              ...(batch.ended ? [batch.ended.reason] : []),
            ].join("\n"),
          }))}
          status={ended?.status}
          exitCode={ended?.exitCode}
          outputFile={notification.outputFile}
        />
      );
    }
    if (item.kind === "subagent")
      return (
        <SubagentResultNotificationItem
          key={item.notificationId}
          result={item}
        />
      );
    return (
      <BackgroundJobPanel
        key={item.notificationId}
        backgroundJobId={item.backgroundJobId}
        appearance="notification"
        notificationIcon={
          <NotificationJobNumber
            jobId={item.backgroundJobId}
            fallback={<TerminalIcon className="size-3" />}
          />
        }
        command={item.command}
        summary={item.summary}
        status={item.status}
        exitCode={item.exitCode}
        outputFile={item.outputFile}
      />
    );
  });
}

/** `BackgroundJobNotifications` around the proposed rows. */
function ProposedNotificationsBlock({
  notifications,
}: {
  notifications: BackgroundJobNotification[];
}) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection
      defaultOpen
      className="overflow-hidden"
      title={
        <>
          <Bell className="size-4 shrink-0 text-muted-foreground" />
          {t("backgroundJobNotifications.title")}
        </>
      }
      actions={
        <Badge
          variant="secondary"
          className="h-5 min-w-5 rounded-full px-1.5 text-muted-foreground"
        >
          {notifications.length}
        </Badge>
      }
      contentClassName="gap-0.5 border-t p-2"
    >
      <ProposedNotificationItems notifications={notifications} />
    </CollapsibleSection>
  );
}

function NotificationFrame({
  hint,
  children,
}: {
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col gap-0.5">{children}</div>
      <span className="pl-1 text-[11px] text-muted-foreground">↳ {hint}</span>
    </div>
  );
}

function ManagePanelSection({ state }: { state: JobState }) {
  const { t } = useTranslation();
  const commands = JobList.filter((job) => job.monitor === undefined);
  const monitors = JobList.filter((job) => job.monitor !== undefined);
  const renderGroups = (render: (job: JobSpec) => ReactNode) => [
    { label: t("managePanel.pochiGroup"), rows: commands.map(render) },
    { label: t("managePanel.monitorsGroup"), rows: monitors.map(render) },
  ];

  return (
    <SurfaceSection
      title="③ 后台任务管理面板"
      changes={[
        "去掉 Eye / EyeOff / FileText，点击整行是唯一打开入口",
        "行结构与通知行一致：[%N] 命令 [状态]",
        "左侧编号槽：%N 仅展示，与对话中的卡片 / 通知对应；无编号的任务回退为类型图标，保持对齐",
        "右侧状态槽：平时显示 spinner / 结束状态点，悬停或聚焦时原位换成 [■]（运行中）或 [复制]（已结束）",
      ]}
    >
      <Scenario
        title="命令与 Monitor 分组 · 含一条未编号命令（bun run build --watch）"
        current={
          <PanelFrame
            groups={renderGroups((job) => (
              <li key={job.id}>
                <JobRow job={buildJobEntry(job, state)} parentTaskId={TaskId} />
              </li>
            ))}
          />
        }
        proposed={
          <PanelFrame
            groups={renderGroups((job) => (
              <li key={job.id}>
                <ProposedJobRow job={job} entry={buildJobEntry(job, state)} />
              </li>
            ))}
          />
        }
      />
    </SurfaceSection>
  );
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

type ProposalArgs = {
  state: JobState;
  revealActions: boolean;
};

function BackgroundJobUiProposal({
  state: initialState,
  revealActions,
}: ProposalArgs) {
  const [state, setState] = useState(initialState);
  useEffect(() => setState(initialState), [initialState]);
  return (
    <ScenarioHost key={state} state={state} onStateChange={setState}>
      <div data-reveal-actions={revealActions} className="flex flex-col gap-8">
        {revealActions && (
          // Hover-only actions stay visible so the two variants can be compared.
          <style>{`[data-reveal-actions="true"] .opacity-0 { opacity: 1 !important; }`}</style>
        )}
        <ChatCardSection state={state} />
        <NotificationSection />
        <ManagePanelSection state={state} />
      </div>
    </ScenarioHost>
  );
}

const meta = {
  title: "Proposals/Background Job UI",
  component: BackgroundJobUiProposal,
  args: {
    state: "running",
    revealActions: true,
  },
  argTypes: {
    state: { control: "select", options: JobStates },
  },
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof BackgroundJobUiProposal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison: Story = {};
