import { DiffViewer } from "@/components/message/diff-viewer";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditSummary, FileIcon } from "@/features/tools";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import type { UserEdits } from "@getpochi/common/vscode-webui-bridge";
import { ChevronRight, FileDiff, FilePenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VscDiffMultiple, VscGoToFile } from "react-icons/vsc";
import { type DiffStats, getDiffStats } from "./user-edits-utils";

interface Props {
  userEdits: UserEdits;
  checkpoints?: {
    origin: string | undefined;
    modified: string | undefined;
  };
  hideActions?: boolean;
}

export const UserEditsPart: React.FC<Props> = ({
  userEdits,
  checkpoints,
  hideActions,
}) => {
  const { t } = useTranslation();
  const visibleUserEdits = userEdits ?? [];
  const editStats = useMemo(
    () => visibleUserEdits.map((edit) => getDiffStats(edit.diff)),
    [visibleUserEdits],
  );

  if (visibleUserEdits.length === 0) return null;

  const onShowDiff = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checkpoints?.origin) {
      await vscodeHost.showCheckpointDiff(
        t("userEdits.diffTitle", { defaultValue: "User Edits" }),
        { origin: checkpoints.origin, modified: checkpoints.modified },
        visibleUserEdits.map((e) => e.filepath),
      );
    }
  };

  const totalAdded = editStats.reduce((sum, stats) => sum + stats.added, 0);
  const totalRemoved = editStats.reduce((sum, stats) => sum + stats.removed, 0);

  return (
    <CollapsibleSection
      title={
        <>
          <FilePenLine className="size-3.5 shrink-0" />
          {t("userEdits.title", { defaultValue: "Edits" })}
        </>
      }
      actions={
        <>
          <span className="text-muted-foreground text-xs">
            {t("userEdits.filesEdited", {
              count: visibleUserEdits.length,
              defaultValue: "{{count}} file edited",
            })}
          </span>
          <EditSummary
            editSummary={{ added: totalAdded, removed: totalRemoved }}
            className="text-xs"
          />
          {!hideActions && checkpoints?.origin && (
            <div
              className="hidden items-center group-hover:flex"
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={onShowDiff}
                  >
                    <VscDiffMultiple className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("userEdits.showDiff", { defaultValue: "Show Diff" })}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </>
      }
      contentClassName="gap-1"
    >
      {visibleUserEdits.map((edit, index) => (
        <UserEditItem
          key={edit.filepath}
          edit={edit}
          stats={editStats[index] ?? { added: 0, removed: 0 }}
          checkpoints={checkpoints}
          hideActions={hideActions}
        />
      ))}
    </CollapsibleSection>
  );
};

interface UserEditItemProps {
  edit: NonNullable<UserEdits>[number];
  checkpoints?: {
    origin: string | undefined;
    modified: string | undefined;
  };
  hideActions?: boolean;
  stats: DiffStats;
}

function UserEditItem({
  edit,
  checkpoints,
  hideActions,
  stats,
}: UserEditItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  const onOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeHost.openFile(edit.filepath);
  };

  const onShowDiff = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checkpoints?.origin) {
      await vscodeHost.showCheckpointDiff(
        t("userEdits.diffTitle", { defaultValue: "User Edits" }),
        { origin: checkpoints.origin, modified: checkpoints.modified },
        [edit.filepath],
      );
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className="group flex cursor-pointer items-center justify-between rounded py-1 transition-colors hover:bg-border/30"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex min-w-0 items-center gap-1.5 px-3">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
          <span className="flex items-center truncate font-medium text-sm">
            <FileIcon path={edit.filepath} />
            <span className="ml-1.5">{edit.filepath}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 text-xs">
          <EditSummary editSummary={stats} className="text-xs" />
          {!hideActions && (
            <div className="hidden items-center gap-1 group-hover:flex">
              {checkpoints?.origin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onShowDiff}
                      className="h-5 w-5"
                    >
                      <FileDiff className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("userEdits.showDiff", { defaultValue: "Show Diff" })}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onOpenFile}
                    className="h-5 w-5"
                  >
                    <VscGoToFile className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("diffSummary.openFile")}</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      <CollapsibleContent>
        <div className="pr-3 pb-2 pl-9">
          <DiffViewer patch={edit.diff} filePath={edit.filepath} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
