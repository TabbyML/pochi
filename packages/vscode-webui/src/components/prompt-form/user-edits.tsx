import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { EditSummary } from "@/features/tools";
import { useUserEdits } from "@/lib/hooks/use-user-edits";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import type { FileDiff } from "@getpochi/common/vscode-webui-bridge";
import { FilePenLine, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

interface UserEditsBadgeProps {
  className?: string;
  taskId: string;
  lastCheckpoint: string;
  onRemove?: () => void;
}

interface UserEditsProps {
  userEdits: FileDiff[];
  originCheckpoint: string;
  modifiedCheckpoint?: string;
  className?: string;
  onRemove?: () => void;
}

export const UserEditsBadge: React.FC<UserEditsBadgeProps> = ({
  taskId,
  className,
  lastCheckpoint,
  onRemove,
}) => {
  const userEdits = useUserEdits(taskId);

  return (
    <UserEdits
      userEdits={userEdits}
      className={className}
      originCheckpoint={lastCheckpoint}
      onRemove={onRemove}
    />
  );
};

export const UserEdits: React.FC<UserEditsProps> = ({
  userEdits,
  className,
  originCheckpoint,
  modifiedCheckpoint,
  onRemove,
}) => {
  const { t } = useTranslation();

  const showFileChanges = () => {
    vscodeHost.showCheckpointDiff(
      "Your edits",
      {
        origin: originCheckpoint,
        modified: modifiedCheckpoint,
      },
      userEdits.map((userEdit) => userEdit.filepath),
    );
  };

  const totalAdditions = userEdits.reduce((sum, file) => sum + file.added, 0);
  const totalDeletions = userEdits.reduce((sum, file) => sum + file.removed, 0);

  if (!userEdits.length) return null;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "group inline-flex h-[1.7rem] max-w-full cursor-pointer items-center gap-1 overflow-hidden truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] px-1 hover:bg-accent/40",
            className,
          )}
          onClick={showFileChanges}
        >
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("userEdits.remove")}
              className="relative size-3.5 shrink-0 p-0 hover:bg-transparent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
            >
              <FilePenLine className="absolute size-3.5 transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0" />
              <X className="absolute size-3.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100" />
            </Button>
          ) : (
            <FilePenLine className="size-3.5" />
          )}
          <span className="text-sm">
            {t("userEdits.filesEdited", {
              count: userEdits.length,
            })}
          </span>
          <EditSummary
            editSummary={{ added: totalAdditions, removed: totalDeletions }}
            className="text-sm"
          />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto bg-background p-2" align="start">
        <p className="m-0 text-xs">{t("userEdits.tooltip")}</p>
      </HoverCardContent>
    </HoverCard>
  );
};
