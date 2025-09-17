import type { Editor } from "@tiptap/react";
import { useRef } from "react";

import { DevRetryCountdown } from "@/components/dev-retry-countdown";
import { ActiveSelectionBadge } from "@/components/prompt-form/active-selection-badge";
import { FormEditor } from "@/components/prompt-form/form-editor";
import type { useApprovalAndRetry } from "@/features/approval";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";

import { QueuedMessages } from "./queued-messages";

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
