import { Button } from "@/components/ui/button";
import type { Editor } from "@tiptap/react";
import { Layers, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    <div className="mx-2 mt-2 flex gap-1.5 overflow-hidden rounded-lg border border-border bg-muted/50 pl-1">
      <div className="mt-3.5 shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="ml-2 flex items-center gap-1.5">
                <Layers className="size-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="tezt-sm">
              <p>{t("chat.queuedMessages", { count: renderMessage.length })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ScrollArea
        className="flex-1 overflow-hidden"
        viewportClassname="max-h-40"
      >
        <div className="flex flex-col gap-1 py-2 pr-1">
          {renderMessage.map((msg, index) => (
            <div
              key={index}
              className="flex items-start justify-between gap-2 px-2 py-1 text-sm"
            >
              <p className="truncate" title={msg}>
                {msg}
              </p>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => onRemove(index)}
                className="h-5 w-5 shrink-0"
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
