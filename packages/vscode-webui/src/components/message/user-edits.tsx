import { CodeBlock } from "@/components/message";
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VscDiffMultiple, VscGoToFile } from "react-icons/vsc";

interface Props {
  userEdits: UserEdits;
  checkpoints?: {
    origin: string | undefined;
    modified: string | undefined;
  };
}

export const UserEditsPart: React.FC<Props> = ({ userEdits, checkpoints }) => {
  const { t } = useTranslation();

  if (!userEdits || userEdits.length === 0) return null;

  const onShowDiff = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (checkpoints?.origin) {
      await vscodeHost.showCheckpointDiff(
        t("userEdits.diffTitle", { defaultValue: "User Edits" }),
        { origin: checkpoints.origin, modified: checkpoints.modified },
        userEdits.map((e) => e.filepath),
      );
    }
  };

  const totalAdded = userEdits.reduce(
    (sum, edit) => sum + (edit.diff.match(/^\+/gm) || []).length,
    0,
  );
  const totalRemoved = userEdits.reduce(
    (sum, edit) => sum + (edit.diff.match(/^\-/gm) || []).length,
    0,
  );

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
              count: userEdits.length,
              defaultValue: "{{count}} file edited",
            })}
          </span>
          <EditSummary
            editSummary={{ added: totalAdded, removed: totalRemoved }}
            className="text-xs"
          />
          {checkpoints?.origin && (
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
      {userEdits.map((edit) => (
        <UserEditItem
          key={edit.filepath}
          edit={edit}
          checkpoints={checkpoints}
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
}

function UserEditItem({ edit, checkpoints }: UserEditItemProps) {
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

  // Calculate simple stats from diff string if possible (lines added/removed)
  const added = (edit.diff.match(/^\+/gm) || []).length;
  const removed = (edit.diff.match(/^\-/gm) || []).length;

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
          <EditSummary editSummary={{ added, removed }} className="text-xs" />
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
        </div>
      </div>
      <CollapsibleContent>
        <div className="pr-3 pb-2 pl-9">
          <CodeBlock
            className=""
            language="diff"
            value={edit.diff}
            isMinimalView={true}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
