import type { Editor } from "@tiptap/react";
import { useRef } from "react";

import { DevRetryCountdown } from "@/components/dev-retry-countdown";
import { ActiveSelectionBadge } from "@/components/prompt-form/active-selection-badge";
import { FormEditor } from "@/components/prompt-form/form-editor";
import type { useApprovalAndRetry } from "@/features/approval";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";

import { ReviewBadges } from "@/components/prompt-form/review-badges";
import { UserEditsBadge } from "@/components/prompt-form/user-edits";
import type { Review } from "@getpochi/common/vscode-webui-bridge";
import type { ReactNode } from "@tanstack/react-router";
import type { ChatInput } from "../hooks/use-chat-input-state";
import { QueuedMessages } from "./queued-messages";

interface ChatInputFormProps {
  input: ChatInput;
  setInput: (input: ChatInput) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCtrlSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isLoading: boolean;
  editable?: boolean;
  onPaste: (event: ClipboardEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  pendingApproval: ReturnType<typeof useApprovalAndRetry>["pendingApproval"];
  status: UseChatHelpers<Message>["status"];
  onFileDrop?: (files: File[]) => boolean;
  messageContent?: string;
  queuedMessages: string[];
  onRemoveQueuedMessage: (index: number) => void;
  isSubTask: boolean;
  children?: ReactNode;
  reviews: Review[];
  taskId?: string;
  lastCheckpointHash?: string;
}

export function ChatInputForm({
  input,
  setInput,
  onSubmit,
  onCtrlSubmit,
  isLoading,
  editable,
  onPaste,
  onFocus,
  pendingApproval,
  status,
  onFileDrop,
  messageContent,
  queuedMessages,
  onRemoveQueuedMessage,
  isSubTask,
  reviews,
  taskId,
  lastCheckpointHash,
  children,
}: ChatInputFormProps) {
  const editorRef = useRef<Editor | null>(null);

  return (
    <FormEditor
      input={input}
      setInput={setInput}
      onSubmit={onSubmit}
      onCtrlSubmit={onCtrlSubmit}
      isLoading={isLoading}
      editable={editable}
      editorRef={editorRef}
      onPaste={onPaste}
      enableSubmitHistory={true}
      onFileDrop={onFileDrop}
      messageContent={messageContent}
      isSubTask={isSubTask}
      onFocus={onFocus}
    >
      <div className="mt-1 flex select-none flex-wrap items-center gap-1.5 pl-2">
        <ActiveSelectionBadge
          onClick={() => {
            editorRef.current?.commands.insertContent(" @");
          }}
        />
        {taskId && lastCheckpointHash && (
          <UserEditsBadge taskId={taskId} lastCheckpoint={lastCheckpointHash} />
        )}
        <ReviewBadges reviews={reviews} />
      </div>
      <DevRetryCountdown pendingApproval={pendingApproval} status={status} />
      {queuedMessages.length > 0 && (
        <QueuedMessages
          messages={queuedMessages}
          onRemove={onRemoveQueuedMessage}
        />
      )}
      {children}
    </FormEditor>
  );
}
