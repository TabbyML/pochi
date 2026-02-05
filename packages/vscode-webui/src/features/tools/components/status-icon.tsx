import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsDevMode } from "@/features/settings";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import {
  Check,
  CheckIcon,
  CircleSmall,
  FilesIcon,
  Loader2,
  Pause,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatusIconProps {
  tool: ToolUIPart;
  isExecuting: boolean;
  className?: string;
  iconClassName?: string;
}

export function StatusIcon({
  tool,
  isExecuting,
  className,
  iconClassName,
}: StatusIconProps) {
  const { t } = useTranslation();
  const [isDevMode] = useIsDevMode();
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  let error: string | undefined;
  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    "error" in tool.output &&
    typeof tool.output.error === "string"
  ) {
    error = tool.output.error;
  }

  if (tool.state === "output-error") {
    error = tool.errorText;
  }

  const tooltipContent = [];

  const devButton = (
    <span
      onClick={() => copyToClipboard(JSON.stringify(tool, null, 2))}
      className="my-1 flex cursor-pointer items-center rounded px-2 py-1 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      {isCopied ? (
        <CheckIcon size={12} className="inline text-sm text-success" />
      ) : (
        <FilesIcon className="inline" size={12} />
      )}
      <span className="ml-2 text-sm">{t("statusIcon.copyToolResult")}</span>
    </span>
  );

  if (isDevMode) {
    tooltipContent.push(devButton);
  }

  let statusIcon = (
    <Pause
      className={cn("size-4 text-zinc-500 dark:text-zinc-400", iconClassName)}
    />
  );
  if (error) {
    statusIcon = (
      <X className={cn("size-4 cursor-help text-error", iconClassName)} />
    );
    tooltipContent.push(<p>{error}</p>);
  } else if (tool.state === "output-available") {
    statusIcon = (
      <Check
        className={cn(
          "size-4 text-emerald-700 dark:text-emerald-300",
          iconClassName,
        )}
      />
    );
  } else if (tool.state === "input-streaming") {
    statusIcon = (
      <CircleSmall
        className={cn(
          "size-4 animate-bounce text-zinc-500 dark:text-zinc-400",
          iconClassName,
        )}
      />
    );
  } else if (isExecuting) {
    statusIcon = (
      <Loader2
        className={cn(
          "size-4 animate-spin text-zinc-500 dark:text-zinc-400",
          iconClassName,
        )}
      />
    );
  }

  if (tooltipContent.length > 0) {
    statusIcon = (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{statusIcon}</TooltipTrigger>
          <TooltipContent className="max-w-[calc(100vw-30px)]">
            {tooltipContent.map((item, index) => (
              <div className="text-wrap break-words" key={index}>
                {item}
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("inline-block align-sub", className)}>{statusIcon}</div>
  );
}
