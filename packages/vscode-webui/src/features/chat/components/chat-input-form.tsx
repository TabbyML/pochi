import type { Editor } from "@tiptap/react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { DevRetryCountdown } from "@/components/dev-retry-countdown";
import { ActiveSelectionBadge } from "@/components/prompt-form/active-selection-badge";
import { AddContextMenu } from "@/components/prompt-form/add-context-menu";
import { FormEditor } from "@/components/prompt-form/form-editor";
import type { useApprovalAndRetry } from "@/features/approval";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";

import { PastedTextCard } from "@/components/pasted-text-card";
import { ReviewBadges } from "@/components/prompt-form/review-badges";
import { TerminalContextBadges } from "@/components/prompt-form/terminal-context-badges";
import { UserEdits } from "@/components/prompt-form/user-edits";
import { useActiveSelection } from "@/lib/hooks/use-active-selection";
import type {
  FileDiff,
  Review,
  TerminalTextSelection,
} from "@getpochi/common/vscode-webui-bridge";
import type { ReactNode } from "@tanstack/react-router";
import type { ChatInput } from "../hooks/use-chat-input-state";
import type { DraftMessage } from "../hooks/use-chat-submit";
import { QueuedMessages } from "./queued-messages";

interface ChatInputFormProps {
  input: ChatInput;
  setInput: (input: ChatInput) => void;
  onSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    input: ChatInput,
  ) => Promise<void>;
  onCtrlSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    input: ChatInput,
  ) => Promise<void>;
  isLoading: boolean;
  editable?: boolean;
  onPaste: (event: ClipboardEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  pendingApproval: ReturnType<typeof useApprovalAndRetry>["pendingApproval"];
  status: UseChatHelpers<Message>["status"];
  onFileDrop?: (files: File[]) => boolean;
  messageContent?: string;
  isSubTask: boolean;
  children?: ReactNode;
  reviews: Review[];
  userEdits?: FileDiff[];
  lastCheckpointHash?: string;
  onRemoveUserEdits?: () => void;
  terminalContextSelections?: TerminalTextSelection[];
  onRemoveTerminalContextSelection?: (index: number) => void;
  onSwitchSubmitMode?: () => void;
  isPlanMode?: boolean;
  onSelectTodoMode?: () => void;
  todoModeDisabled?: boolean;
  onAttachFile?: () => void;
  contextMenuSide?: "top" | "bottom";
  className?: string;
  queuedMessages?: DraftMessage[];
  onRemoveQueuedMessage?: (index: number) => void;
  onSteerQueuedMessage?: (index: number) => void;
  allowSteer?: boolean;
}

export interface ChatInputFormHandle {
  addToSubmitHistory: () => void;
  getInputSnapshot: () => ChatInput | undefined;
}

export const ChatInputForm = forwardRef<
  ChatInputFormHandle,
  ChatInputFormProps
>(function ChatInputForm(
  {
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
    isSubTask,
    reviews,
    userEdits = [],
    lastCheckpointHash,
    onRemoveUserEdits,
    terminalContextSelections = [],
    onRemoveTerminalContextSelection,
    children,
    onSwitchSubmitMode,
    onSelectTodoMode,
    todoModeDisabled,
    onAttachFile,
    contextMenuSide = "top",
    className,
    queuedMessages = [],
    onRemoveQueuedMessage,
    onSteerQueuedMessage,
    allowSteer,
  },
  ref,
) {
  const editorRef = useRef<Editor | null>(null);
  const activeSelection = useActiveSelection();
  const showAddContextLabel = !activeSelection;
  const pastedTexts = input.pastedTexts ?? [];

  const appendPastedText = useCallback(
    (text: string) => {
      setInput({
        ...input,
        pastedTexts: [...pastedTexts, text],
      });
    },
    [input, pastedTexts, setInput],
  );

  const removePastedText = useCallback(
    (index: number) => {
      setInput({
        ...input,
        pastedTexts: pastedTexts.filter((_, itemIndex) => itemIndex !== index),
      });
    },
    [input, pastedTexts, setInput],
  );

  useImperativeHandle(ref, () => ({
    addToSubmitHistory: () => {
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed) {
        editor.commands.addToSubmitHistory(JSON.stringify(editor.getJSON()));
      }
    },
    getInputSnapshot: () => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) {
        return undefined;
      }
      return {
        json: editor.getJSON(),
        text: editor.getText({ blockSeparator: "\n" }),
        pastedTexts: input.pastedTexts,
      };
    },
  }));

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
      onPastedText={appendPastedText}
      enableSubmitHistory={true}
      onFileDrop={onFileDrop}
      messageContent={messageContent}
      isSubTask={isSubTask}
      onFocus={onFocus}
      onSwitchSubmitMode={onSwitchSubmitMode}
      className={className}
    >
      <div className="mt-1 flex select-none flex-wrap items-center gap-1.5 pl-2">
        <AddContextMenu
          side={contextMenuSide}
          showLabel={showAddContextLabel}
          onAddFilesAndFolders={() => {
            editorRef.current?.commands.insertContent(" @");
            setTimeout(() => {
              editorRef.current?.commands.focus();
            }, 0);
          }}
          onAttachFile={onAttachFile}
          onSelectTodoMode={
            onSelectTodoMode
              ? () => {
                  onSelectTodoMode();
                  setTimeout(() => {
                    editorRef.current?.commands.focus();
                  }, 0);
                }
              : undefined
          }
          todoModeDisabled={todoModeDisabled}
        />
        <ActiveSelectionBadge />
        <TerminalContextBadges
          selections={terminalContextSelections}
          onRemove={onRemoveTerminalContextSelection}
        />
        {userEdits.length > 0 && lastCheckpointHash && (
          <UserEdits
            userEdits={userEdits}
            originCheckpoint={lastCheckpointHash}
            onRemove={onRemoveUserEdits}
          />
        )}
        <ReviewBadges reviews={reviews} />
      </div>
      <DevRetryCountdown pendingApproval={pendingApproval} status={status} />
      {queuedMessages.length > 0 && (
        <QueuedMessages
          messages={queuedMessages}
          onRemove={(index) => onRemoveQueuedMessage?.(index)}
          onSteer={
            onSteerQueuedMessage
              ? (index) => onSteerQueuedMessage(index)
              : undefined
          }
          allowSteer={allowSteer}
        />
      )}
      {pastedTexts.length > 0 || children ? (
        <div className="mt-2 mb-3 flex flex-wrap items-start gap-2 px-3">
          {pastedTexts.map((text, index) => (
            <PastedTextCard
              key={`${index}-${text.length}`}
              text={text}
              onRemove={() => removePastedText(index)}
            />
          ))}
          {children}
        </div>
      ) : null}
    </FormEditor>
  );
});
