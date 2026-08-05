import { CodeBlock } from "@/components/message";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { getActiveSelectionLabel } from "@/lib/utils/active-selection";
import {
  getFileExtension,
  languageIdFromExtension,
} from "@/lib/utils/languages";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { parseTitle } from "@getpochi/common/message-utils";
import type { ActiveSelection } from "@getpochi/common/vscode-webui-bridge";
import {
  Activity,
  CornerDownRight,
  FileCode,
  ListEnd,
  Target,
  Trash2,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DraftMessage } from "../hooks/use-chat-submit";

interface QueuedMessagesProps {
  messages: DraftMessage[];
  onRemove: (index: number) => void;
  onSteer?: (index: number) => void;
  allowSteer?: boolean;
}

interface RenderMessage {
  title: string;
  details: string;
  isTodoMode?: boolean;
  isMonitor?: boolean;
  activeSelection?: ActiveSelection;
}

export const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  messages,
  onRemove,
  onSteer,
  allowSteer = true,
}) => {
  const { t } = useTranslation();
  const renderMessages = useMemo<RenderMessage[]>(() => {
    return messages.map(({ raw }) => {
      const {
        text = "",
        filesCount = 0,
        reviewsCount = 0,
        userEditsCount = 0,
        terminalContextCount = 0,
        isTodoMode,
        monitor,
        activeSelection,
      } = raw;
      const title = text.trim() ? parseTitle(text) : t("chat.noMessage");
      const details = [
        filesCount > 0 ? t("chat.fileCount", { count: filesCount }) : "",
        reviewsCount > 0 ? t("chat.reviewCount", { count: reviewsCount }) : "",
        userEditsCount > 0
          ? t("chat.userEditCount", { count: userEditsCount })
          : "",
        terminalContextCount > 0
          ? t("chat.terminalContextCount", { count: terminalContextCount })
          : "",
      ].filter(Boolean);

      return {
        title,
        details: details.join(" · "),
        isTodoMode,
        isMonitor: !!monitor,
        activeSelection,
      };
    });
  }, [messages, t]);

  return (
    <div className="mx-1 mt-2 mb-1.5 flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
      {renderMessages.map((message, index) => (
        <div
          key={index}
          className="group flex h-6 items-center gap-2 text-muted-foreground"
        >
          {message.isTodoMode ? (
            <Target className="size-3.5 shrink-0" />
          ) : message.isMonitor ? (
            <Activity className="size-3.5 shrink-0" />
          ) : (
            <ListEnd className="size-3.5 shrink-0 scale-x-[-1]" />
          )}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <p
              className="min-w-0 truncate text-sm"
              title={
                message.details
                  ? `${message.title} (${message.details})`
                  : message.title
              }
            >
              {message.title}
            </p>
            {message.details ? (
              <span className="shrink-0 text-muted-foreground/70 text-xs">
                {message.details}
              </span>
            ) : null}
          </div>
          {message.activeSelection && (
            <ActiveSelectionPreviewIcon
              activeSelection={message.activeSelection}
            />
          )}
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={() => onSteer?.(index)}
              aria-label={t("chat.steer")}
              disabled={!onSteer || !allowSteer}
              className={cn(
                "h-7 gap-1 rounded-full px-1.5 text-muted-foreground text-sm",
                "hover:bg-transparent hover:text-foreground",
              )}
            >
              <CornerDownRight className="size-3.5" />
              <span>{t("chat.steer")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Remove queued message"
              onClick={() => onRemove(index)}
              className="h-7 w-7 rounded-full text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

interface ActiveSelectionPreviewIconProps {
  activeSelection: ActiveSelection;
}

const ActiveSelectionPreviewIcon: React.FC<ActiveSelectionPreviewIconProps> = ({
  activeSelection,
}) => {
  const { t } = useTranslation();

  if (!activeSelection) {
    return null;
  }

  const { filepath, range, content, notebookCell } = activeSelection;

  if (content.length === 0) {
    return null;
  }

  const extension = getFileExtension(filepath);
  const language = languageIdFromExtension(extension) || "typescript";
  const label = getActiveSelectionLabel(activeSelection, t);

  const onClick = () => {
    if (!isVSCodeEnvironment()) return;
    vscodeHost.openFile(filepath, {
      start: range.start.line + 1,
      end: range.end.line + 1,
      cellId: notebookCell?.cellId,
    });
  };

  return (
    <HoverCard openDelay={300} closeDelay={200}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={filepath}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm hover:bg-zinc-200 active:bg-zinc-200 dark:active:bg-zinc-700 dark:hover:bg-zinc-700"
        >
          <FileCode className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto max-w-[90vw] p-0" align="end">
        <div className="flex max-w-[300px] items-center gap-1.5 truncate border-b px-2 py-1.5 font-medium text-xs">
          <FileCode className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <CodeBlock
            language={language}
            value={content}
            isMinimalView={true}
            className="m-0 border-none"
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
