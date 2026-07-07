import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseTitle } from "@getpochi/common/message-utils";
import { CornerDownRight, ListEnd, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { QueuedMessage } from "../hooks/use-chat-submit";

interface QueuedMessagesProps {
  messages: QueuedMessage[];
  onRemove: (index: number) => void;
  onSteer?: (index: number) => void;
}

export const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  messages,
  onRemove,
  onSteer,
}) => {
  const { t } = useTranslation();
  const renderMessages = useMemo(() => {
    return messages.map(({ text, files, reviews }) => {
      const title = text.trim() ? parseTitle(text) : t("chat.noMessage");
      const details = [
        files.length > 0 ? t("chat.fileCount", { count: files.length }) : "",
        reviews.length > 0
          ? t("chat.reviewCount", { count: reviews.length })
          : "",
      ].filter(Boolean);

      return {
        title,
        details: details.join(" · "),
      };
    });
  }, [messages, t]);

  return (
    <div className="mx-5 flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-t-sm border border-[var(--input-border)] border-b-0 bg-input px-3 pt-1.5 pb-1.5 shadow-lg">
      {renderMessages.map((message, index) => (
        <div
          key={index}
          className="group flex h-6 items-center gap-2 text-muted-foreground"
        >
          <ListEnd className="size-3.5 shrink-0 scale-x-[-1]" />
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
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={() => onSteer?.(index)}
              aria-label={t("chat.steer")}
              disabled={!onSteer}
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
