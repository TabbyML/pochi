import { Loader2, UserIcon } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";

import { ReasoningPartUI } from "@/components/reasoning-part.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BackgroundJobContextProvider,
  useAutoApproveGuard,
  useToolCallLifeCycle,
} from "@/features/chat";
import { ToolInvocationPart } from "@/features/tools";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useLatestCheckpoint } from "@/lib/hooks/use-latest-checkpoint";
import { cn, formatExecutionDuration } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import type {
  ActiveSelection,
  TerminalTextSelection,
} from "@getpochi/common/vscode-webui-bridge";
import type { Message, Task } from "@getpochi/livekit";
import { type FileUIPart, type TextUIPart, isStaticToolUIPart } from "ai";
import { memo, useEffect, useMemo } from "react";
import { CheckpointUI, CompactCheckpointUI } from "../checkpoint-ui";
import { ActiveSelectionPart, TerminalSelectionPart } from "./active-selection";
import { MessageAttachments } from "./attachments";
import { BackgroundJobNotifications } from "./background-job-notifications";
import { MessageMarkdown } from "./markdown";
import type { MermaidContext } from "./mermaid-context";
import { MermaidContextProvider } from "./mermaid-context";
import { Reviews } from "./reviews";
import { useMessageListPagination } from "./use-message-list-pagination";
import { UserEditsPart } from "./user-edits";

interface UserEditsCheckpoint {
  origin: string | undefined;
  modified: string | undefined;
}

export const MessageList: React.FC<{
  messages: Message[];
  user?: {
    name: string;
    image?: string | null;
  };
  assistant?: {
    name: string;
    image?: string | null;
  };
  isLoading: boolean;
  loadingLabel?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  showUserAvatar?: boolean;
  className?: string;
  viewportClassname?: string;
  showLoader?: boolean;
  forkTask?: (commitId: string, messageId?: string) => Promise<void>;
  isSubTask?: boolean;
  hideUserEditsActions?: boolean;
  repairMermaid?: MermaidContext["repairMermaid"];
  repairingChart?: string | null;
  showLastStepDuration?: boolean;
  taskStatus?: Task["status"];
  /** Mounts the full history for shared output and performance baselines. */
  renderAllMessages?: boolean;
  /** Formats only the mounted raw-message range. */
  formatMessages?: (messages: Message[]) => Message[];
  emptyPlaceholder?: React.ReactNode;
}> = ({
  messages,
  isLoading,
  loadingLabel,
  user = { name: "User" },
  assistant,
  containerRef,
  showUserAvatar = true,
  className,
  viewportClassname,
  showLoader = true,
  forkTask,
  isSubTask,
  hideUserEditsActions,
  repairMermaid,
  repairingChart,
  showLastStepDuration,
  taskStatus,
  renderAllMessages = false,
  formatMessages,
  emptyPlaceholder,
}) => {
  const [debouncedIsLoading, setDebouncedIsLoading] = useDebounceState(
    isLoading,
    300,
  );

  useEffect(() => {
    setDebouncedIsLoading(isLoading);
  }, [isLoading, setDebouncedIsLoading]);

  const { executingToolCalls, completeToolCalls } = useToolCallLifeCycle();
  const isExecuting = executingToolCalls.length > 0;
  const autoApproveGuard = useAutoApproveGuard();
  const isAboutToExecuteWithAutoApprove =
    !isLoading &&
    !isExecuting &&
    taskStatus === "pending-tool" &&
    autoApproveGuard.current === "auto" &&
    completeToolCalls.length === 0;
  const shouldCheckpointUseLoading =
    isLoading || isExecuting || isAboutToExecuteWithAutoApprove;
  const assistantName = assistant?.name ?? "Pochi";
  const latestCheckpoint = useLatestCheckpoint();
  const toolCallCheckpoints = useMemo(
    () => buildToolCallCheckpoints(messages),
    [messages],
  );
  const userEditsCheckpoints = useMemo(
    () => buildUserEditsCheckpoints(messages),
    [messages],
  );
  const lastCheckpointInMessage = useMemo(() => {
    return messages
      .flatMap((msg) => msg.parts)
      .findLast((part) => part.type === "data-checkpoint")?.data.commit;
  }, [messages]);

  const mermaidContextValue = useMemo(
    () =>
      repairMermaid
        ? {
            repairMermaid,
            repairingChart:
              isLoading || isExecuting ? null : (repairingChart ?? null),
          }
        : null,
    [repairMermaid, repairingChart, isLoading, isExecuting],
  );

  // Paginate raw messages before formatting the mounted range.
  const { start, hiddenAboveCount, loadEarlierTriggerRef } =
    useMessageListPagination({
      messages,
      containerRef,
      enabled: !renderAllMessages && containerRef !== undefined,
    });
  const visibleRawMessages = useMemo(
    () => messages.slice(start),
    [messages, start],
  );
  const renderMessages = useMemo(
    () =>
      formatMessages ? formatMessages(visibleRawMessages) : visibleRawMessages,
    [formatMessages, visibleRawMessages],
  );

  return (
    <BackgroundJobContextProvider messages={messages}>
      <MermaidContextProvider value={mermaidContextValue}>
        <ScrollArea
          className={cn("mb-2 flex-1 overflow-y-auto px-4", className)}
          viewportClassname={viewportClassname}
          ref={containerRef}
        >
          {start === 0 && renderMessages.length === 0 && emptyPlaceholder}
          {hiddenAboveCount > 0 && (
            <EarlierMessagesEdge ref={loadEarlierTriggerRef} />
          )}
          {renderMessages.map((m, messageIndex) => {
            return (
              <div
                key={m.id}
                className="message-list-item flex flex-col"
                aria-label={`chat-message-${m.role}`}
              >
                <div className={cn(showUserAvatar && "pt-4 pb-2")}>
                  {showUserAvatar && (
                    <div className="flex items-center gap-2">
                      {m.role === "user" ? (
                        <Avatar className="size-7 select-none">
                          <AvatarImage src={user?.image ?? undefined} />
                          <AvatarFallback
                            className={cn(
                              "bg-[var(--vscode-chat-avatarBackground)] text-[var(--vscode-chat-avatarForeground)] text-xs uppercase",
                            )}
                          >
                            {user?.name.slice(0, 2) || (
                              <UserIcon className={cn("size-[50%]")} />
                            )}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <Avatar className="size-7 select-none">
                          <AvatarImage
                            src={assistant?.image ?? undefined}
                            className="scale-110"
                          />
                          <AvatarFallback className="bg-[var(--vscode-chat-avatarBackground)] text-[var(--vscode-chat-avatarForeground)]" />
                        </Avatar>
                      )}
                      <strong>
                        {m.role === "user" ? user?.name : assistantName}
                      </strong>
                    </div>
                  )}
                  <div
                    className={cn(
                      "ml-1 flex flex-col",
                      showUserAvatar && "mt-3",
                    )}
                  >
                    {m.parts.map((part, index) => (
                      <Part
                        role={m.role}
                        key={index}
                        messageId={m.id}
                        isLastPartInMessages={
                          index === m.parts.length - 1 &&
                          messageIndex === renderMessages.length - 1
                        }
                        isInLatestAssistantMessage={
                          m.role === "assistant" &&
                          messageIndex === renderMessages.length - 1
                        }
                        partIndex={index}
                        part={part}
                        isLoading={isLoading}
                        shouldCheckpointUseLoading={shouldCheckpointUseLoading}
                        forkTask={forkTask}
                        isSubTask={isSubTask}
                        hideUserEditsActions={hideUserEditsActions}
                        latestCheckpoint={latestCheckpoint}
                        lastCheckpointInMessage={lastCheckpointInMessage}
                        userEditsCheckpoint={userEditsCheckpoints.get(m.id)}
                        toolCallCheckpoint={
                          isStaticToolUIPart(part)
                            ? toolCallCheckpoints.get(part.toolCallId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                  {/* Display attachments at the bottom of the message */}
                  <UserAttachments message={m} />
                  <UserSelections message={m} />
                  <MessageBackgroundJobNotifications message={m} />
                </div>
                {messageIndex < renderMessages.length - 1 ? (
                  <SeparatorWithCheckpoint
                    isFirstMessageInHistory={start === 0 && messageIndex === 0}
                    message={m}
                    nextMessage={renderMessages[messageIndex + 1]}
                    isLoading={shouldCheckpointUseLoading}
                    forkTask={forkTask}
                    isSubTask={isSubTask}
                    latestCheckpoint={latestCheckpoint}
                    lastCheckpointInMessage={lastCheckpointInMessage}
                  />
                ) : (
                  showLastStepDuration &&
                  !shouldCheckpointUseLoading && (
                    <OptionalSeparatorWithExecutionDuration
                      duration={computeExecutionDuration(m)}
                    />
                  )
                )}
              </div>
            );
          })}
          {showLoader && (
            <div className="py-2">
              {debouncedIsLoading ? (
                <div className="mx-auto flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-6 animate-spin" />
                  {loadingLabel && <span>{loadingLabel}</span>}
                </div>
              ) : (
                <Loader2 className="invisible mx-auto size-6" />
              )}
            </div>
          )}
        </ScrollArea>
      </MermaidContextProvider>
    </BackgroundJobContextProvider>
  );
};

function UserAttachments({ message }: { message: Message }) {
  const fileParts = message.parts.filter(
    (part) => part.type === "file",
  ) as FileUIPart[];

  if (message.role === "user" && fileParts.length) {
    return (
      <div className="mt-3">
        <MessageAttachments attachments={fileParts} />
      </div>
    );
  }
}

function UserSelections({ message }: { message: Message }) {
  const selectionParts = message.parts.filter(
    (part) => part.type === "data-active-selection",
  ) as {
    type: "data-active-selection";
    data: {
      activeSelection?: ActiveSelection;
    };
  }[];

  const terminalContextParts = message.parts.filter(
    (part) => part.type === "data-terminal-context",
  ) as {
    type: "data-terminal-context";
    data: {
      textSelections: TerminalTextSelection[];
    };
  }[];

  const terminalContextSelections = terminalContextParts.flatMap(
    (part) => part.data.textSelections,
  );

  if (
    message.role !== "user" ||
    (!selectionParts.length && !terminalContextSelections.length)
  ) {
    return;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {selectionParts.map(
        (part, index) =>
          part.data.activeSelection && (
            <ActiveSelectionPart
              key={index}
              activeSelection={part.data.activeSelection}
            />
          ),
      )}
      {terminalContextSelections.map((textSelection, index) => (
        <TerminalSelectionPart
          key={index}
          terminalTextSelection={textSelection}
        />
      ))}
    </div>
  );
}

function MessageBackgroundJobNotifications({ message }: { message: Message }) {
  if (message.role !== "user") return null;
  const notifications = message.parts.flatMap((part) =>
    part.type === "data-background-job-notification" ? [part.data] : [],
  );
  return <BackgroundJobNotifications notifications={notifications} />;
}

function EarlierMessagesEdge({
  ref,
}: {
  ref: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-testid="message-list-auto-load-earlier"
      aria-hidden="true"
      className="pointer-events-none h-px w-full"
    />
  );
}

function Part({
  role,
  part,
  partIndex,
  messageId,
  isLastPartInMessages,
  isInLatestAssistantMessage,
  isLoading,
  shouldCheckpointUseLoading,
  forkTask,
  isSubTask,
  latestCheckpoint,
  lastCheckpointInMessage,
  hideUserEditsActions,
  userEditsCheckpoint,
  toolCallCheckpoint,
}: {
  role: Message["role"];
  partIndex: number;
  messageId: string;
  part: NonNullable<Message["parts"]>[number];
  isLastPartInMessages: boolean;
  isInLatestAssistantMessage: boolean;
  isLoading: boolean;
  shouldCheckpointUseLoading: boolean;
  forkTask?: (commitId: string) => Promise<void>;
  isSubTask?: boolean;
  hideUserEditsActions?: boolean;
  latestCheckpoint: string | null;
  lastCheckpointInMessage: string | undefined;
  userEditsCheckpoint?: {
    origin: string | undefined;
    modified: string | undefined;
  };
  toolCallCheckpoint?: ToolCallCheckpoint;
}) {
  const paddingClass = partIndex === 0 ? "" : "mt-2";
  if (part.type === "text") {
    return (
      <MemoTextPartUI
        className={paddingClass}
        part={part}
        role={role}
        messageId={messageId}
      />
    );
  }

  if (part.type === "reasoning") {
    return (
      <MemoReasoningPartUI
        className={paddingClass}
        part={part}
        isLoading={isLastPartInMessages}
      />
    );
  }

  if (part.type === "step-start" || part.type === "file") {
    return;
  }

  if (part.type === "data-checkpoint") {
    if (role === "assistant" && isVSCodeEnvironment() && !isSubTask) {
      return (
        <CheckpointUI
          checkpoint={part.data}
          isLoading={shouldCheckpointUseLoading}
          forkTask={forkTask}
          isRestored={
            lastCheckpointInMessage !== part.data.commit &&
            latestCheckpoint === part.data.commit
          }
        />
      );
    }
    return null;
  }

  if (part.type === "data-reviews") {
    return <Reviews reviews={part.data.reviews} />;
  }

  if (part.type === "data-user-edits") {
    return (
      <UserEditsPart
        userEdits={part.data.userEdits}
        checkpoints={userEditsCheckpoint}
        hideActions={hideUserEditsActions}
      />
    );
  }

  if (part.type === "data-active-selection") {
    return null;
  }

  if (part.type === "data-terminal-context") {
    return null;
  }

  if (part.type === "data-background-job-notification") {
    return null;
  }

  if (isStaticToolUIPart(part)) {
    return (
      <ToolInvocationPart
        className={paddingClass}
        tool={part}
        isLoading={isLoading}
        changes={toolCallCheckpoint}
        isSubTask={isSubTask}
        isLastPart={isLastPartInMessages}
        isInLatestAssistantMessage={isInLatestAssistantMessage}
      />
    );
  }

  return <div>{JSON.stringify(part)}</div>;
}

function TextPartUI({
  className,
  part,
  role,
  messageId,
}: {
  part: TextUIPart;
  role: Message["role"];
  messageId: string;
  className?: string;
}) {
  if (part.text.trim().length === 0) {
    return null; // Skip empty text parts
  }

  if (prompts.isCompact(part.text)) {
    // Only render the compact checkpoint inline for assistant messages
    // (the compact-only user message was merged into the assistant message
    // by the formatter). For user messages, the compact checkpoint is
    // rendered by SeparatorWithCheckpoint.
    if (role === "assistant") {
      return <CompactCheckpointUI compactPart={part} messageId={messageId} />;
    }
    return null;
  }

  return <MessageMarkdown className={className}>{part.text}</MessageMarkdown>;
}

const MemoTextPartUI = memo(
  TextPartUI,
  (prev, next) =>
    prev.part.text === next.part.text &&
    prev.messageId === next.messageId &&
    prev.role === next.role,
);
MemoTextPartUI.displayName = "MemoTextPartUI";

function ReasoningPartRenderer(props: Parameters<typeof ReasoningPartUI>[0]) {
  return <ReasoningPartUI {...props} />;
}

const MemoReasoningPartUI = memo(ReasoningPartRenderer, (prev, next) => {
  return prev.part.text === next.part.text && prev.isLoading === next.isLoading;
});
MemoReasoningPartUI.displayName = "MemoReasoningPartUI";

const SeparatorWithCheckpoint: React.FC<{
  isFirstMessageInHistory: boolean;
  message: Message;
  nextMessage: Message;
  isLoading: boolean;
  forkTask?: (commitId: string, messageId?: string) => Promise<void>;
  isSubTask?: boolean;
  latestCheckpoint: string | null;
  lastCheckpointInMessage: string | undefined;
}> = ({
  isFirstMessageInHistory,
  message,
  nextMessage,
  isLoading,
  forkTask,
  isSubTask,
  latestCheckpoint,
  lastCheckpointInMessage,
}) => {
  const sep = <Separator className="mt-1 mb-2" />;
  if (isSubTask) return sep;

  let checkpointMessage: Message | null = null;
  let restoreMessageId: string | undefined = undefined;
  if (isFirstMessageInHistory && message.role === "user") {
    checkpointMessage = message;
  }

  if (
    !checkpointMessage &&
    message.role === "assistant" &&
    nextMessage.role === "user"
  ) {
    checkpointMessage = nextMessage;
    restoreMessageId = message.id;
  }

  // When a compact-only user message was merged into an adjacent assistant
  // message by the formatter, the compact part lives on the assistant message.
  // The compact checkpoint is then rendered inline by TextPartUI.
  if (!checkpointMessage) return sep;

  const compactPart = findCompactPart(checkpointMessage);
  const lastPart = checkpointMessage.parts.at(-1);
  const executionDuration = computeExecutionDuration(message);

  if (
    lastPart &&
    lastPart.type === "data-checkpoint" &&
    isVSCodeEnvironment()
  ) {
    return (
      <div className="mt-1 mb-2">
        <CheckpointUI
          checkpoint={lastPart.data}
          isLoading={isLoading}
          hideBorderOnHover={false}
          showSeparatorLine={true}
          className="max-w-full"
          forkTask={forkTask}
          restoreMessageId={restoreMessageId}
          isRestored={
            lastCheckpointInMessage !== lastPart.data.commit &&
            latestCheckpoint === lastPart.data.commit
          }
          compactPart={compactPart}
          compactMessageId={checkpointMessage.id}
          executionDuration={executionDuration}
        />
      </div>
    );
  }

  if (compactPart) {
    return (
      <div className="mt-1 mb-2">
        <CompactCheckpointUI
          compactPart={compactPart}
          messageId={checkpointMessage.id}
        />
      </div>
    );
  }

  if (executionDuration) {
    return (
      <OptionalSeparatorWithExecutionDuration duration={executionDuration} />
    );
  }

  return sep;
};

const OptionalSeparatorWithExecutionDuration: React.FC<{
  duration: number | undefined;
}> = ({ duration }) => {
  const { t } = useTranslation();
  if (duration == null) return null;
  const label = t("messageList.completedIn", {
    duration: formatExecutionDuration(duration),
  });
  return (
    <div className="mt-1 mb-2 flex items-center gap-2 text-muted-foreground/60 text-xs">
      <div className="flex-1 border-border border-t" />
      <span>{label}</span>
      <div className="flex-1 border-border border-t" />
    </div>
  );
};

export interface ToolCallCheckpoint {
  origin?: string;
  modified?: string;
}

function buildToolCallCheckpoints(messages: Message[]) {
  const toolCallCheckpoints = new Map<string, ToolCallCheckpoint>();
  const partsInOrder: Array<Message["parts"][number]> = [];
  let latestCheckpoint: string | undefined;

  for (const message of messages) {
    for (const part of message.parts) {
      partsInOrder.push(part);

      if (part.type === "data-checkpoint") {
        latestCheckpoint = part.data.commit;
        continue;
      }

      if (isStaticToolUIPart(part)) {
        toolCallCheckpoints.set(part.toolCallId, {
          origin: latestCheckpoint,
        });
      }
    }
  }

  let nextCheckpoint: string | undefined;

  for (let index = partsInOrder.length - 1; index >= 0; index -= 1) {
    const part = partsInOrder[index];

    if (part.type === "data-checkpoint") {
      nextCheckpoint = part.data.commit;
      continue;
    }

    if (isStaticToolUIPart(part)) {
      const checkpoint = toolCallCheckpoints.get(part.toolCallId);
      if (checkpoint) {
        checkpoint.modified = nextCheckpoint;
      }
    }
  }

  return toolCallCheckpoints;
}

function findCompactPart(message: Message): TextUIPart | undefined {
  for (const x of message.parts) {
    if (x.type === "text" && prompts.isCompact(x.text)) {
      return x;
    }
  }
}

function buildUserEditsCheckpoints(messages: Message[]) {
  const userEditsCheckpoints = new Map<string, UserEditsCheckpoint>();
  const checkpointHistory: string[] = [];

  for (const message of messages) {
    let hasUserEdits = false;

    for (const part of message.parts) {
      if (part.type === "data-checkpoint") {
        checkpointHistory.push(part.data.commit);
        continue;
      }

      if (part.type === "data-user-edits") {
        hasUserEdits = true;
      }
    }

    if (
      message.role !== "user" ||
      !hasUserEdits ||
      checkpointHistory.length < 2
    ) {
      continue;
    }

    userEditsCheckpoints.set(message.id, {
      origin: checkpointHistory.at(-2),
      modified: checkpointHistory.at(-1),
    });
  }

  return userEditsCheckpoints;
}

function computeExecutionDuration(message: Message) {
  return message.metadata?.kind === "assistant" &&
    message.metadata.totalStreamingDuration !== undefined
    ? message.metadata.totalStreamingDuration +
        (message.metadata.totalToolsExecutionDuration ?? 0)
    : undefined;
}
