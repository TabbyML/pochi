import { FileBadge } from "@/features/tools";
import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import { cn } from "@/lib/utils";
import { getActiveSelectionLabel } from "@/lib/utils/active-selection";
import { useTranslation } from "react-i18next";

interface ActiveSelectionBadgeProps {
  className?: string;
}

export const ActiveSelectionBadge: React.FC<ActiveSelectionBadgeProps> = ({
  className,
}) => {
  const activeSelection = useActiveSelection();
  const { t } = useTranslation();

  if (!activeSelection) return null;

  return (
    <div
      className={cn(
        "inline-flex h-[1.7rem] max-w-full items-center gap-1 overflow-hidden truncate rounded-sm",
        className,
      )}
    >
      <FileBadge
        className="hover:!bg-transparent !py-0 m-0 cursor-default truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] pr-1"
        labelClassName="whitespace-nowrap"
        label={getActiveSelectionLabel(activeSelection, t)}
        path={activeSelection.filepath}
        startLine={
          // display as 1-based, but not for notebook cells (show cell index instead)
          activeSelection.content.length > 0 && !activeSelection.notebookCell
            ? activeSelection.range.start.line + 1
            : undefined
        }
        endLine={
          activeSelection.content.length > 0 && !activeSelection.notebookCell
            ? activeSelection.range.end.line + 1
            : undefined
        }
      />
    </div>
  );
};
