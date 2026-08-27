import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBackgroundJobInfo } from "@/features/chat";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useVisibleTerminals } from "@/lib/hooks/use-visible-terminals";
import { formatTerminalDisplayName } from "@/lib/terminal-display-name";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import type { TFunction } from "i18next";
import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleCheck,
  CircleStop,
  CopyIcon,
  FileText,
  TerminalIcon,
  X,
  XCircle,
} from "lucide-react";
import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { XTerm } from "./xterm";

export const CopyCommandButton: FC<{ command: string }> = ({ command }) => {
  const { t } = useTranslation();
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    timeout: 2000,
  });

  const onCopy = () => {
    if (isCopied) return;
    copyToClipboard(command);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          onClick={onCopy}
          className={cn({ "opacity-50": isCopied })}
        >
          {isCopied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>
          {isCopied
            ? t("commandExecutionPanel.copied")
            : t("commandExecutionPanel.copyCommand")}
        </span>
      </TooltipContent>
    </Tooltip>
  );
};

const ToggleExpandButton: FC<{ expanded: boolean; onToggle: () => void }> = ({
  expanded,
  onToggle,
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 p-0 text-xs focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0"
          onClick={onToggle}
        >
          {expanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
          <span className="sr-only">
            {expanded
              ? t("commandExecutionPanel.collapse")
              : t("commandExecutionPanel.expand")}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="m-0">
          {expanded
            ? t("commandExecutionPanel.collapse")
            : t("commandExecutionPanel.expand")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * The badge in front of a job/terminal panel: opens the live terminal, or --
 * once that terminal is gone -- its recorded output file.
 */
const JobControlButton: FC<{
  label: string;
  isActive?: boolean;
  /** Nothing left to open: keep the badge, drop the interaction. */
  inert?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, isActive, inert, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      {inert ? (
        // A plain span rather than a disabled button: disabled buttons swallow
        // pointer events, which would hide the tooltip explaining why nothing
        // can be opened anymore.
        <span
          aria-label={label}
          className="inline-flex size-[16px] shrink-0 cursor-default items-center justify-center rounded-sm bg-secondary text-muted-foreground opacity-60"
        >
          {children}
        </span>
      ) : (
        <Button
          size="sm"
          aria-label={label}
          className={cn("size-[16px] rounded-sm ring-primary", {
            "ring-1": isActive,
          })}
          variant="secondary"
          onClick={onClick}
        >
          {children}
        </Button>
      )}
    </TooltipTrigger>
    <TooltipContent>
      <span>{label}</span>
    </TooltipContent>
  </Tooltip>
);

export const CommandPanelContainer: FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  expanded?: boolean;
  actions?: React.ReactNode;
  className?: string;
  output?: string;
}> = ({ icon, title, expanded, actions, className, output }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className={cn(
        "group code-block relative w-full overflow-hidden rounded-sm border bg-[var(--vscode-editor-background)] font-sans text-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-full items-center justify-between rounded-t-sm bg-[var(--vscode-editor-background)] px-3 py-1.5 text-[var(--vscode-editor-foreground)]",
          {
            "border-b": expanded,
          },
        )}
      >
        <div className="flex min-w-0 flex-1 space-x-3">
          {icon}
          <ScrollArea className="max-h-[80px] min-w-0 flex-1 overflow-y-auto">
            <div className="whitespace-pre-wrap text-balance break-all">
              {title}
            </div>
          </ScrollArea>
        </div>
        <div
          className={cn(
            "ml-2 flex space-x-3 self-start transition-opacity",
            expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {actions}
        </div>
      </div>
      {expanded && output && (
        <div
          ref={containerRef}
          className={cn(
            "w-full overflow-hidden pl-3 transition-all duration-500 ease-in-out",
            expanded
              ? "h-[42px] max-h-[500px] opacity-100"
              : "h-0 max-h-0 opacity-0",
          )}
        >
          <XTerm
            className="h-full w-full pt-2"
            content={output}
            containerRef={containerRef}
          />
        </div>
      )}
    </div>
  );
};

export const BackgroundJobPanel: FC<{
  backgroundJobId: string;
  output?: string;
  appearance?: "default" | "notification";
  /** Command fallback for persisted notification messages. */
  command?: string;
  /** Summary fallback for persisted notification messages. */
  summary?: string;
  status?: "completed" | "failed" | "stopped";
  exitCode?: number;
  outputFile?: string;
  /** Terminal name snapshot from the tool output (term- ids only). */
  terminalName?: string;
  /** Last command run in the terminal, from the tool output (term- ids only). */
  lastCommand?: string;
}> = ({
  backgroundJobId,
  output,
  appearance = "default",
  command,
  summary,
  status,
  exitCode,
  outputFile,
  terminalName,
  lastCommand,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((prev) => !prev);
  const info = useBackgroundJobInfo(backgroundJobId);
  const { terminals, openBackgroundJobTerminal } = useVisibleTerminals();
  const isUserTerminal = backgroundJobId.startsWith("term-");
  // Live name wins over the snapshot: the terminal may have been renamed
  // since the read. The snapshot keeps historical reads meaningful after the
  // terminal is closed.
  const liveTerminal = useMemo(
    () => terminals?.find((tm) => tm.backgroundJobId === backgroundJobId),
    [backgroundJobId, terminals],
  );
  const isNotification = appearance === "notification";
  const recoveredNotificationCommand = isNotification
    ? recoverNotificationCommand(summary, status)
    : undefined;
  const resolvedCommand = isNotification
    ? (recoveredNotificationCommand ?? info?.command ?? command)
    : (info?.command ?? command);
  const hasTrackedJob = Boolean(info?.command);
  const copyCommand = resolvedCommand ?? lastCommand;
  const displayTerminalName = formatTerminalDisplayName(
    liveTerminal?.name ?? terminalName,
    lastCommand,
  );
  const title = isUserTerminal
    ? (displayTerminalName ?? t("commandExecutionPanel.userTerminal"))
    : (resolvedCommand ?? backgroundJobId);
  const isActive = liveTerminal?.isActive ?? false;

  // Terminals closed after the read keep their badge, so the panel still reads
  // as a terminal/job panel; the badge then falls back to the output file.
  const isTerminalClosed = terminals !== undefined && !liveTerminal;
  const canOpenOutputFile = isTerminalClosed && outputFile !== undefined;

  const openTerminalOrOutputFile = useCallback(() => {
    if (isTerminalClosed) {
      if (outputFile) vscodeHost.openFile(outputFile);
      return;
    }
    openBackgroundJobTerminal?.(backgroundJobId);
  }, [
    backgroundJobId,
    isTerminalClosed,
    openBackgroundJobTerminal,
    outputFile,
  ]);

  const closedLabel = canOpenOutputFile
    ? t("commandExecutionPanel.terminalClosedOpenOutput")
    : t("commandExecutionPanel.terminalClosed");
  const jobControl = isUserTerminal
    ? (liveTerminal || isTerminalClosed) && (
        <JobControlButton
          label={
            isTerminalClosed
              ? closedLabel
              : t("commandExecutionPanel.openTerminal", {
                  name: liveTerminal?.name ?? terminalName,
                })
          }
          isActive={!isNotification && isActive}
          inert={isTerminalClosed && !canOpenOutputFile}
          onClick={openTerminalOrOutputFile}
        >
          <TerminalIcon className="size-3" />
        </JobControlButton>
      )
    : hasTrackedJob &&
      info?.displayId && (
        <JobControlButton
          label={
            isTerminalClosed
              ? closedLabel
              : t("commandExecutionPanel.openJob", {
                  displayId: info.displayId,
                })
          }
          isActive={!isNotification && isActive}
          inert={isTerminalClosed && !canOpenOutputFile}
          onClick={openTerminalOrOutputFile}
        >
          <div className="font-bold font-mono text-[10px]">
            {info.displayId}
          </div>
        </JobControlButton>
      );

  if (isNotification) {
    return (
      <div className="group flex min-w-0 items-center gap-3 rounded-sm px-1 py-1 text-sm hover:bg-muted/30">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <JobControlButton
            label={
              isTerminalClosed
                ? closedLabel
                : t("commandExecutionPanel.openJob", {
                    displayId: info?.displayId ?? backgroundJobId,
                  })
            }
            inert={isTerminalClosed && !canOpenOutputFile}
            onClick={openTerminalOrOutputFile}
          >
            <TerminalIcon className="size-3" />
          </JobControlButton>
          <code
            className="min-w-0 flex-1 truncate bg-transparent p-0 font-mono text-foreground text-xs"
            title={resolvedCommand ?? backgroundJobId}
          >
            {resolvedCommand ?? backgroundJobId}
          </code>
        </div>
        {status && <NotificationStatus status={status} summary={summary} />}
      </div>
    );
  }

  return (
    <CommandPanelContainer
      icon={
        jobControl && (
          <div className="flex shrink-0 items-center gap-2 self-start">
            {jobControl}
          </div>
        )
      }
      title={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{title}</span>
          {status && (
            <BackgroundJobStatus status={status} exitCode={exitCode} />
          )}
        </div>
      }
      expanded={output !== undefined && expanded}
      actions={
        <>
          {output && (
            <ToggleExpandButton expanded={expanded} onToggle={toggleExpanded} />
          )}
          {outputFile && <OpenOutputFileButton outputFile={outputFile} />}
          {copyCommand && <CopyCommandButton command={copyCommand} />}
        </>
      }
      output={output}
    />
  );
};

function recoverNotificationCommand(
  summary: string | undefined,
  status: "completed" | "failed" | "stopped" | undefined,
): string | undefined {
  const prefix = 'Background command "';
  if (!summary?.startsWith(prefix) || !status) return undefined;

  const lifecycleMarker =
    status === "completed"
      ? '" completed'
      : status === "stopped"
        ? '" was stopped'
        : '" failed';
  const markerIndex = summary.lastIndexOf(lifecycleMarker);
  if (markerIndex < prefix.length) return undefined;

  return summary.slice(prefix.length, markerIndex);
}

const NotificationStatus: FC<{
  status: "completed" | "failed" | "stopped";
  summary?: string;
}> = ({ status, summary }) => {
  const { t } = useTranslation();
  const label =
    status === "completed"
      ? t("backgroundJobNotifications.completedNoExit")
      : status === "failed"
        ? t("backgroundJobNotifications.failedNoExit")
        : t("backgroundJobNotifications.stopped");
  const statusContent = (
    <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
      {label}
      {status === "failed" && (
        <X aria-hidden="true" className="size-4 text-destructive" />
      )}
    </span>
  );

  if (!summary) return statusContent;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{statusContent}</TooltipTrigger>
      <TooltipContent>
        <span className="block max-w-sm whitespace-pre-wrap break-words">
          {summary}
        </span>
      </TooltipContent>
    </Tooltip>
  );
};

const BackgroundJobStatus: FC<{
  status: "completed" | "failed" | "stopped";
  exitCode?: number;
}> = ({ status, exitCode }) => {
  const { t } = useTranslation();
  const Icon =
    status === "completed"
      ? CircleCheck
      : status === "stopped"
        ? CircleStop
        : XCircle;
  const label = getBackgroundJobStatusLabel(status, exitCode, t);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs",
        {
          "text-success": status === "completed",
          "text-destructive": status === "failed",
        },
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
};

function getBackgroundJobStatusLabel(
  status: "completed" | "failed" | "stopped",
  exitCode: number | undefined,
  t: TFunction,
): string {
  return status === "completed"
    ? t("backgroundJobNotifications.completed", { exitCode: exitCode ?? 0 })
    : status === "failed"
      ? exitCode === undefined
        ? t("backgroundJobNotifications.failedNoExit")
        : t("backgroundJobNotifications.failed", { exitCode })
      : t("backgroundJobNotifications.stopped");
}

const OpenOutputFileButton: FC<{ outputFile: string }> = ({ outputFile }) => {
  const { t } = useTranslation();
  const label = t("backgroundJobNotifications.openOutput");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          aria-label={label}
          onClick={() => vscodeHost.openFile(outputFile)}
        >
          <FileText className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

export interface ExecutionPanelProps {
  command: string;
  output: string;
  onStop: () => void;
  completed: boolean;
  isExecuting: boolean;
  className?: string;
}

export const CommandExecutionPanel: FC<ExecutionPanelProps> = ({
  command,
  output,
  className,
  onStop,
  isExecuting,
  completed,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded, setExpandedImmediately] =
    useExpanded(completed);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const toggleExpanded = () => setExpandedImmediately((prev) => !prev);

  const handleStop = () => {
    setIsStopping(true);
    onStop();
  };

  // Collapse when execution completes
  const wasCompleted = useRef(completed);
  useEffect(() => {
    if (!wasCompleted.current && !isExecuting && completed) {
      setExpanded(false);
    }
  }, [isExecuting, completed, setExpanded]);

  // Reset stopping state when execution completes
  useEffect(() => {
    if (!isExecuting) {
      setIsStopping(false);
    }
  }, [isExecuting]);

  const showButton = !completed && isExecuting && !isStopping;
  return (
    <CommandPanelContainer
      icon={<TerminalIcon className="mt-[2px] size-4 flex-shrink-0" />}
      title={command}
      expanded={output !== undefined && expanded}
      className={className}
      actions={
        <>
          {false && showButton && (
            <Button size="xs" variant="ghost" onClick={handleStop}>
              {t("commandExecutionPanel.stop")}
            </Button>
          )}
          {output && (
            <ToggleExpandButton expanded={expanded} onToggle={toggleExpanded} />
          )}
          <CopyCommandButton command={command} />
        </>
      }
      output={output}
    />
  );
};

function useExpanded(completed: boolean) {
  return useDebounceState(!completed, 1_500, {
    leading: !isVSCodeEnvironment(),
  });
}
