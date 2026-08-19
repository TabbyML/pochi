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
import {
  Check,
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleCheck,
  CircleStop,
  CopyIcon,
  FileText,
  Pause,
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

const BackgroundJobIdButton: FC<{
  displayId: string;
  isActive?: boolean;
  onClick: () => void;
}> = ({ displayId, isActive, onClick }) => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          className={cn("size-[16px] rounded-sm ring-primary", {
            "ring-1": isActive,
          })}
          variant="secondary"
          onClick={onClick}
        >
          <div className="font-bold font-mono text-[10px]">{displayId}</div>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>{t("commandExecutionPanel.openJob", { displayId })}</span>
      </TooltipContent>
    </Tooltip>
  );
};

const OpenTerminalButton: FC<{
  name: string;
  isActive?: boolean;
  onClick: () => void;
}> = ({ name, isActive, onClick }) => {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          className={cn("size-[16px] rounded-sm ring-primary", {
            "ring-1": isActive,
          })}
          variant="secondary"
          onClick={onClick}
        >
          <TerminalIcon className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>{t("commandExecutionPanel.openTerminal", { name })}</span>
      </TooltipContent>
    </Tooltip>
  );
};

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
            <span className="whitespace-pre-wrap text-balance break-all">
              {title}
            </span>
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
  const resolvedCommand = info?.command ?? command;
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
  const isNotification = appearance === "notification";

  const openTerminal = useCallback(() => {
    openBackgroundJobTerminal?.(backgroundJobId);
  }, [backgroundJobId, openBackgroundJobTerminal]);
  const jobControl = isUserTerminal
    ? liveTerminal && (
        <OpenTerminalButton
          name={liveTerminal.name}
          isActive={!isNotification && isActive}
          onClick={openTerminal}
        />
      )
    : hasTrackedJob &&
      info?.displayId && (
        <BackgroundJobIdButton
          displayId={info.displayId}
          isActive={!isNotification && isActive}
          onClick={openTerminal}
        />
      );

  return (
    <CommandPanelContainer
      icon={
        ((isNotification && status) || jobControl) && (
          <div className="flex shrink-0 items-center gap-2">
            {isNotification && status && (
              <BackgroundJobStatus
                status={status}
                exitCode={exitCode}
                iconOnly
              />
            )}
            {jobControl}
          </div>
        )
      }
      title={
        <div
          className={cn("flex items-center", {
            "flex-nowrap gap-1.5": isNotification,
            "flex-wrap gap-x-2 gap-y-1": !isNotification,
          })}
        >
          <span
            className={cn({
              "min-w-0 truncate whitespace-nowrap": isNotification,
            })}
          >
            {title}
          </span>
          {status && !isNotification && (
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

const BackgroundJobStatus: FC<{
  status: "completed" | "failed" | "stopped";
  exitCode?: number;
  iconOnly?: boolean;
}> = ({ status, exitCode, iconOnly = false }) => {
  const { t } = useTranslation();
  const Icon = iconOnly
    ? status === "completed"
      ? Check
      : status === "failed"
        ? X
        : Pause
    : status === "completed"
      ? CircleCheck
      : status === "stopped"
        ? CircleStop
        : XCircle;
  const label =
    status === "completed"
      ? t("backgroundJobNotifications.completed", { exitCode: exitCode ?? 0 })
      : status === "failed"
        ? exitCode === undefined
          ? t("backgroundJobNotifications.failedNoExit")
          : t("backgroundJobNotifications.failed", { exitCode })
        : t("backgroundJobNotifications.stopped");

  if (iconOnly) {
    return (
      <span className="inline-flex shrink-0 items-center">
        <Icon
          className={cn("size-4", {
            "text-emerald-700 dark:text-emerald-300": status === "completed",
            "text-error": status === "failed",
            "text-zinc-500 dark:text-zinc-400": status === "stopped",
          })}
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

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
