import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBackgroundJobInfo } from "@/features/chat";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useVisibleTerminals } from "@/lib/hooks/use-visible-terminals";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  TerminalIcon,
} from "lucide-react";
import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "../ui/scroll-area";
import { XTerm } from "./xterm";

const CopyCommandButton: FC<{ command: string }> = ({ command }) => {
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
        <span>{isCopied ? "Copied!" : "Copy command"}</span>
      </TooltipContent>
    </Tooltip>
  );
};

const ToggleExpandButton: FC<{ expanded: boolean; onToggle: () => void }> = ({
  expanded,
  onToggle,
}) => {
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
          <span className="sr-only">{expanded ? "Collapse" : "Expand"}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="m-0">{expanded ? "Collapse" : "Expand"}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const BackgroundJobIdButton: FC<{
  displayId: string;
  isActive?: boolean;
  onClick: () => void;
}> = ({ displayId, isActive, onClick }) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          className={cn("size-[16px] rounded-sm", {
            "text-primary": isActive,
          })}
          variant="secondary"
          onClick={onClick}
        >
          <div className="font-bold font-mono text-[10px]">{displayId}</div>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>Show {displayId}</span>
      </TooltipContent>
    </Tooltip>
  );
};

const CommandPanelContainer: FC<{
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
        "code-block relative w-full overflow-hidden rounded-sm border bg-[var(--vscode-editor-background)] font-sans",
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
        <div className="ml-2 flex space-x-3 self-start">{actions}</div>
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
}> = ({ backgroundJobId, output }) => {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((prev) => !prev);
  const info = useBackgroundJobInfo(backgroundJobId);
  const { terminals, openBackgroundJobTerminal } = useVisibleTerminals();
  const isActive = useMemo(
    () =>
      backgroundJobId
        ? terminals?.some(
            (t) => t.backgroundJobId === backgroundJobId && t.isActive,
          )
        : false,
    [backgroundJobId, terminals],
  );

  const openTerminal = useCallback(() => {
    openBackgroundJobTerminal?.(backgroundJobId);
  }, [backgroundJobId, openBackgroundJobTerminal]);

  return (
    <CommandPanelContainer
      icon={
        info?.displayId && (
          <BackgroundJobIdButton
            displayId={info.displayId}
            isActive={isActive}
            onClick={openTerminal}
          />
        )
      }
      title={info?.command}
      expanded={output !== undefined && expanded}
      actions={
        <>
          {output && (
            <ToggleExpandButton expanded={expanded} onToggle={toggleExpanded} />
          )}
          {info?.command && <CopyCommandButton command={info?.command} />}
        </>
      }
      output={output}
    />
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
  const [expanded, setExpanded, setExpandedImmediately] =
    useExpanded(completed);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const toggleExpanded = () => setExpandedImmediately((prev) => !prev);

  const handleStop = () => {
    setIsStopping(true);
    onStop();
  };

  // Collapse when execution completes
  useEffect(() => {
    if (!isExecuting && completed) {
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
              STOP
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
  if (isVSCodeEnvironment()) {
    return useDebounceState(!completed, 1_500);
  }
  const [value, setValue] = useState(false);
  return [value, setValue, setValue] as const;
}
