import { Button } from "@/components/ui/button";
import type { Editor } from "@tiptap/react";
import { Layers, X } from "lucide-react";
import { useRef } from "react";
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
import type { useApprovalAndRetry } from "@/features/approval";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";

interface QueuedMessagesProps {
  messages: string[];
  onRemove: (index: number) => void;
  onClear: () => void;
}

const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  messages,
  onRemove,
  onClear,
}) => {
  const { t } = useTranslation();
  return (
    <div className="mx-2 mt-2 flex flex-col rounded-lg border border-border bg-muted/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="ml-2 flex items-center gap-1.5">
                <Layers className="size-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="tezt-sm">
              <p>{t("chat.queuedMessages", { count: messages.length })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {/* <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={onClear}
          className="h-6 w-6"
        >
          <Trash2 className="size-4" />
        </Button> */}
      </div>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {messages.map((msg, index) => (
          <div
            key={index}
            className="flex items-start justify-between gap-2 px-2 py-1 text-sm"
          >
            <p className="flex-1 truncate" title={msg}>
              {msg.split("\n")[0] + (msg.includes("\n") ? "..." : "")}
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
  onClearQueuedMessages: () => void;
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
  onClearQueuedMessages,
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
          onClear={onClearQueuedMessages}
        />
      )}
    </FormEditor>
  );
}
