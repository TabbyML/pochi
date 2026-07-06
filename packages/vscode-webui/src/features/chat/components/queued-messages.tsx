import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseTitle } from "@getpochi/common/message-utils";
import { CornerDownRight, ListEnd, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface QueuedMessagesProps {
  messages: string[];
  onRemove: (index: number) => void;
  onSteer?: (index: number) => void;
}

export const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  messages,
  onRemove,
  onSteer,
}) => {
  const { t } = useTranslation();
  const renderMessage = useMemo(() => {
    return messages.map((x) => parseTitle(x));
  }, [messages]);

  return (
    <div className="mx-5 flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-t-sm border border-[var(--input-border)] border-b-0 bg-input px-3 pt-1.5 pb-1.5 shadow-lg">
      {renderMessage.map((msg, index) => (
        <div
          key={index}
          className="group flex h-6 items-center gap-2 text-muted-foreground"
        >
          <ListEnd className="size-3.5 shrink-0 scale-x-[-1]" />
          <p className="min-w-0 flex-1 truncate text-sm" title={msg}>
            {msg}
          </p>
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
