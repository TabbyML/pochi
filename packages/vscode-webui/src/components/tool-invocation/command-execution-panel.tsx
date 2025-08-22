import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import {
  CheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  TerminalIcon,
} from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { XTerm } from "./xterm";

export interface ExecutionPanelProps {
  command: string;
  output: string;
  onStop: () => void;
  onDetach?: () => void;
  completed: boolean;
  isExecuting: boolean;
  className?: string;
  isBackground?: boolean;
}

export const CommandExecutionPanel: FC<ExecutionPanelProps> = ({
  command,
  output,
  className,
  onStop,
  onDetach,
  isExecuting,
  completed,
  isBackground,
}) => {
  const [expanded, setExpanded, setExpandedImmediately] =
    useExpanded(completed);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const toggleExpanded = () => setExpandedImmediately((prev) => !prev);
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    timeout: 2000,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  const onCopy = () => {
    if (isCopied) return;
    copyToClipboard(command);
  };

  const handleStop = () => {
    setIsStopping(true);
    onStop();
  };

  const handleDetach = onDetach
    ? () => {
        setIsStopping(true);
        onDetach();
      }
    : undefined;

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
            "border-b": output && expanded,
          },
        )}
      >
        <div className="flex min-w-0 flex-1 space-x-3">
          <TerminalIcon className="mt-[2px] size-4 flex-shrink-0" />
          <ScrollArea className="max-h-[80px] min-w-0 flex-1 overflow-y-auto">
            <span className="whitespace-pre-wrap text-balance break-all">
              {command}
            </span>
          </ScrollArea>
        </div>
        <div className="ml-2 flex space-x-3 self-start">
          {false && showButton && (
            <Button size="xs" variant="ghost" onClick={handleStop}>
              STOP
            </Button>
          )}
          {isBackground && showButton && handleDetach !== undefined && (
            <Button size="xs" variant="ghost" onClick={handleDetach}>
              DETACH
            </Button>
          )}
          {output && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 p-0 text-xs focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0"
                  onClick={toggleExpanded}
                >
                  {expanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
                  <span className="sr-only">
                    {expanded ? "Collapse" : "Expand"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="m-0">{expanded ? "Collapse" : "Expand"}</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 p-0 text-xs focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0"
                onClick={onCopy}
              >
                {isCopied ? <CheckIcon /> : <CopyIcon />}
                <span className="sr-only">Copy</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="m-0">Copy</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {output && expanded && (
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

function useExpanded(completed: boolean) {
  if (isVSCodeEnvironment()) {
    return useDebounceState(!completed, 1_500);
  }
  const [value, setValue] = useState(false);
  return [value, setValue, setValue] as const;
}
