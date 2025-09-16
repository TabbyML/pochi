import { Button } from "@/components/ui/button";
import type { Editor } from "@tiptap/react";
import { Layers, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { DevRetryCountdown } from "@/components/dev-retry-countdown";
import { ActiveSelectionBadge } from "@/components/prompt-form/active-selection-badge";
import { FormEditor } from "@/components/prompt-form/form-editor";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { useApprovalAndRetry } from "@/features/approval";
import type { UseChatHelpers } from "@ai-sdk/react";
import { parseTitle } from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";

interface QueuedMessagesProps {
  messages: string[];
  onRemove: (index: number) => void;
}

const QueuedMessages: React.FC<QueuedMessagesProps> = ({
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

interface ChatInputFormProps {
  input: string;
  setInput: (input: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onQueueMessage: (message: string) => void;
  isLoading: boolean;
  onPaste: (event: ClipboardEvent) => void;
  pendingApproval: ReturnType<typeof useApprovalAndRetry>["pendingApproval"];
  status: UseChatHelpers<Message>["status"];
  onFileDrop?: (files: File[]) => boolean;
  messageContent?: string;
  queuedMessages: string[];
  onRemoveQueuedMessage: (index: number) => void;
}

export function ChatInputForm({
  input,
  setInput,
  onSubmit,
  onQueueMessage,
  isLoading,
  onPaste,
  pendingApproval,
  status,
  onFileDrop,
  messageContent,
  queuedMessages,
  onRemoveQueuedMessage,
}: ChatInputFormProps) {
  const editorRef = useRef<Editor | null>(null);

  return (
    <FormEditor
      input={input}
      setInput={setInput}
      onSubmit={onSubmit}
      onQueueSubmit={onQueueMessage}
      isLoading={isLoading}
      editorRef={editorRef}
      onPaste={onPaste}
      enableSubmitHistory={true}
      onFileDrop={onFileDrop}
      messageContent={messageContent}
    >
      <ActiveSelectionBadge
        onClick={() => {
          editorRef.current?.commands.insertContent(" @");
        }}
      />
      <DevRetryCountdown pendingApproval={pendingApproval} status={status} />
      {queuedMessages.length > 0 && (
        <QueuedMessages
          messages={queuedMessages}
          onRemove={onRemoveQueuedMessage}
        />
      )}
    </FormEditor>
  );
}
