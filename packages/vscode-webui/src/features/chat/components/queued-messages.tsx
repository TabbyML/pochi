import { Layers, X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseTitle } from "@getpochi/common/message-utils";

interface QueuedMessagesProps {
  messages: string[];
  onRemove: (index: number) => void;
}

export const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  messages,
  onRemove,
}) => {
  const { t } = useTranslation();
  const renderMessage = useMemo(() => {
    return messages.map((x) => parseTitle(x));
  }, [messages]);

  return (
    <div className="mx-2 mt-2 overflow-hidden rounded-lg border border-border/60 bg-gradient-to-r from-muted/40 to-muted/20">
      {/* Header */}
      <div className="flex items-center border-border/30 border-b bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
          <Layers className="size-3.5" />
          <span>
            {t("chat.queuedMessages", { count: renderMessage.length })}
          </span>
        </div>
      </div>

      {/* Messages List */}
      <ScrollArea
        className="flex-1 overflow-hidden"
        viewportClassname="max-h-32"
      >
        <div>
          {renderMessage.map((msg, index) => (
            <div
              key={index}
              className="group flex items-center gap-3 px-3 py-1 transition-colors hover:bg-muted/50"
            >
              {/* Message content */}
              <p className="flex-1 truncate text-sm" title={msg}>
                {msg}
              </p>

              {/* Remove button */}
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => onRemove(index)}
                className="h-6 w-6 shrink-0"
              >
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
