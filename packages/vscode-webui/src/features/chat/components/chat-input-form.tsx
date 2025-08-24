import type { Editor } from "@tiptap/react";
import { useRef } from "react";

import { DevRetryCountdown } from "@/components/dev-retry-countdown";
import { ActiveSelectionBadge } from "@/components/prompt-form/active-selection-badge";
import { FormEditor } from "@/components/prompt-form/form-editor";
import type { useApprovalAndRetry } from "@/features/approval";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";

interface ChatInputFormProps {
  input: string;
  setInput: (input: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  isLoading: boolean;
  onPaste: (event: ClipboardEvent) => void;
  pendingApproval: ReturnType<typeof useApprovalAndRetry>["pendingApproval"];
  status: UseChatHelpers<Message>["status"];
  onImageUpload?: (files: File[]) => boolean;
}

export function ChatInputForm({
  input,
  setInput,
  onSubmit,
  isLoading,
  onPaste,
  pendingApproval,
  status,
  onImageUpload,
}: ChatInputFormProps) {
  const editorRef = useRef<Editor | null>(null);

  return (
    <FormEditor
      input={input}
      setInput={setInput}
      onSubmit={onSubmit}
      isLoading={isLoading}
      editorRef={editorRef}
      onPaste={onPaste}
      enableSubmitHistory={true}
      onImageUpload={onImageUpload}
    >
      <ActiveSelectionBadge
        onClick={() => {
          editorRef.current?.commands.insertContent(" @");
        }}
      />
      <DevRetryCountdown pendingApproval={pendingApproval} status={status} />
    </FormEditor>
  );
}
