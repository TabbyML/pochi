import { FileBadge } from "@/components/tool-invocation/file-badge";
import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";

interface ActiveSelectionBadgeProps {
  onClick?: () => void;
  className?: string;
}

export const ActiveSelectionBadge: React.FC<ActiveSelectionBadgeProps> = ({
  onClick,
  className,
}) => {
  const activeSelection = useActiveSelection();

  return (
    <div className={cn("mt-1 select-none pl-2", className)}>
      <div
        className={cn(
          "inline-flex h-[1.7rem] max-w-full items-center gap-1 overflow-hidden truncate rounded-sm",
          // {
          //   "border-dashed": !activeSelection,
          // },
        )}
      >
        {activeSelection ? (
          <FileBadge
            className="hover:!bg-transparent !py-0 m-0 cursor-default truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] pr-1"
            labelClassName="whitespace-nowrap"
            label={activeSelection.filepath.split("/").pop()}
            path={activeSelection.filepath}
            startLine={
              // display as 1-based
              activeSelection.content.length > 0
                ? activeSelection.range.start.line + 1
                : undefined
            }
            endLine={
              activeSelection.content.length > 0
                ? activeSelection.range.end.line + 1
                : undefined
            }
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-0 justify-start gap-1 border border-[var(--vscode-chat-requestBorder)] border-dashed bg-transparent px-2 py-0 text-muted-foreground text-sm focus-visible:border-[var(--vscode-focusBorder)] focus-visible:border-solid focus-visible:ring-0 focus-visible:ring-transparent"
            onClick={onClick}
          >
            <Plus className="size-3" />
            Add Context
          </Button>
        )}
      </div>
    </div>
  );
};
