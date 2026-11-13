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
import { type DiffStats, getDiffStats } from "@/lib/utils/diff-stats";
import { vscodeHost } from "@/lib/vscode";
import type { UserEdits } from "@getpochi/common/vscode-webui-bridge";
import { ChevronRight, FilePenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { VscGoToFile } from "react-icons/vsc";

interface Props {
  userEdits: UserEdits;
  hideActions?: boolean;
}

/**
 * Lists the files the user edited between two requests. Read-only: new tasks
 * no longer record user edits, this only renders them in older tasks.
 */
export const UserEditsPart: React.FC<Props> = ({ userEdits, hideActions }) => {
  const { t } = useTranslation();
  const visibleUserEdits = userEdits ?? [];
  const editStats = useMemo(
    () => visibleUserEdits.map((edit) => getDiffStats(edit.diff)),
    [visibleUserEdits],
  );

  if (visibleUserEdits.length === 0) return null;

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
        </>
      }
      contentClassName="gap-1"
    >
      {visibleUserEdits.map((edit, index) => (
        <UserEditItem
          key={edit.filepath}
          edit={edit}
          stats={editStats[index] ?? { added: 0, removed: 0 }}
          hideActions={hideActions}
        />
      ))}
    </CollapsibleSection>
  );
};

interface UserEditItemProps {
  edit: NonNullable<UserEdits>[number];
  hideActions?: boolean;
  stats: DiffStats;
}

function UserEditItem({ edit, hideActions, stats }: UserEditItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  const onOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeHost.openFile(edit.filepath);
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onOpenFile}
                    className="h-5 w-5"
                    aria-label={t("userEdits.openFile")}
                  >
                    <VscGoToFile className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("userEdits.openFile")}</TooltipContent>
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
