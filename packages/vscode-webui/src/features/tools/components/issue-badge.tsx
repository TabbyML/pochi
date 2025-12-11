import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { VscIssues } from "react-icons/vsc";

interface IssueBadgeProps {
  id: string;
  url: string;
  title: string;
  className?: string;
}

export const IssueBadge: React.FC<IssueBadgeProps> = ({
  id,
  url,
  title,
  className,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVSCodeEnvironment()) {
      vscodeHost.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          onClick={handleClick}
          className={cn(
            "mx-px cursor-pointer rounded-sm border border-border box-decoration-clone p-0.5 text-sm/6 hover:bg-zinc-200 active:bg-zinc-200 dark:active:bg-zinc-700 dark:hover:bg-zinc-700",
            className,
          )}
        >
          <VscIssues className="mr-0.5 inline size-3.5 align-text-bottom" />
          <span className="ml-0.5 break-words">#{id}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-[200px]">{title}</p>
      </TooltipContent>
    </Tooltip>
  );
};
