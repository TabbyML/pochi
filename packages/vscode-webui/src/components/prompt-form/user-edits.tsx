import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { EditSummary } from "@/features/tools";
import { useUserEdits } from "@/lib/hooks/use-user-edits";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { useTranslation } from "react-i18next";
import { VscDiffMultiple } from "react-icons/vsc";
interface UserEditsProps {
  onClick?: () => void;
  className?: string;
  taskId: string | undefined;
}

export const UserEdits: React.FC<UserEditsProps> = ({ taskId, className }) => {
  const userEdits = useUserEdits(taskId);
  const { t } = useTranslation();

  const showFileChanges = () => {
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    vscodeHost.openFile(`/userEdits.md`, {
      base64Data: btoa(
        unescape(
          encodeURIComponent(
            userEdits
              .map((edit) => {
                return `**${edit.filepath}** (modified)
\`\`\`diff
${edit.diff}
\`\`\``;
              })
              .join("\n\n"),
          ),
        ),
      ),
    });
  };

  const totalAdditions = userEdits.reduce((sum, file) => sum + file.added, 0);
  const totalDeletions = userEdits.reduce((sum, file) => sum + file.removed, 0);

  if (!userEdits.length) return null;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "inline-flex h-[1.7rem] max-w-full cursor-pointer items-center gap-1 overflow-hidden truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] px-1 hover:bg-accent/40",
            className,
          )}
          onClick={showFileChanges}
        >
          <VscDiffMultiple className="size-3.5" />
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
