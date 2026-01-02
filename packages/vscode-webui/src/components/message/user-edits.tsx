import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CodeBlock } from "@/components/message";
import { EditSummary, FileIcon } from "@/features/tools";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import type { UserEdits } from "@getpochi/common/vscode-webui-bridge";
import { ChevronRight, FilePenLine } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VscGoToFile } from "react-icons/vsc";

interface Props {
  userEdits: UserEdits;
}

export const UserEditsUI: React.FC<Props> = ({ userEdits }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (!userEdits || userEdits.length === 0) return null;

  const totalAdded = userEdits.reduce(
    (sum, edit) => sum + (edit.diff.match(/^\+/gm) || []).length,
    0,
  );
  const totalRemoved = userEdits.reduce(
    (sum, edit) => sum + (edit.diff.match(/^\-/gm) || []).length,
    0,
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-1 mb-2 rounded-md border"
    >
      <CollapsibleTrigger asChild>
        <div className="flex cursor-pointer select-none items-center justify-between border-border px-3 py-1.5 hover:bg-border/30">
          <div className="flex items-center gap-1">
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-90",
              )}
            />
            <FilePenLine className="size-3.5 shrink-0" />
            <div className="font-semibold text-sm">
              {t("userEdits.filesEdited", {
                count: userEdits.length,
                defaultValue: "{{count}} file edited",
              })}
            </div>
          </div>
          <EditSummary
            editSummary={{ added: totalAdded, removed: totalRemoved }}
            className="text-xs"
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1">
          {userEdits.map((edit) => (
            <UserEditItem key={edit.filepath} edit={edit} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface UserEditItemProps {
  edit: NonNullable<UserEdits>[number];
}

function UserEditItem({ edit }: UserEditItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  const onOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    vscodeHost.openFile(edit.filepath);
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
          <span className="truncate font-medium text-sm">
            <FileIcon path={edit.filepath} />
            <span className="ml-1.5">{edit.filepath}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 text-xs">
          <EditSummary editSummary={{ added, removed }} className="text-xs" />
          <div className="hidden items-center gap-1 group-hover:flex">
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
        <div className="pl-9 pr-3 pb-2">
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
