import { Loader2, SquareChartGantt, UserIcon } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";

import { ReasoningPartUI } from "@/components/reasoning-part.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BackgroundJobContextProvider,
  useToolCallLifeCycle,
} from "@/features/chat";
import { ToolInvocationPart } from "@/features/tools";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useLatestCheckpoint } from "@/lib/hooks/use-latest-checkpoint";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import type { ActiveSelection } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import { type FileUIPart, type TextUIPart, isStaticToolUIPart } from "ai";
import { memo, useEffect, useMemo } from "react";
import { CheckpointUI } from "../checkpoint-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ActiveSelectionPart } from "./active-selection";
import { MessageAttachments } from "./attachments";
import { MessageMarkdown } from "./markdown";
import type { MermaidContext } from "./mermaid-context";
import { MermaidContextProvider } from "./mermaid-context";
import { Reviews } from "./reviews";
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
}> = ({
  messages: renderMessages,
  isLoading,
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
}) => {
  const [debouncedIsLoading, setDebouncedIsLoading] = useDebounceState(
    isLoading,
    300,
  );

  useEffect(() => {
    setDebouncedIsLoading(isLoading);
  }, [isLoading, setDebouncedIsLoading]);

  const { executingToolCalls } = useToolCallLifeCycle();
  const isExecuting = executingToolCalls.length > 0;
  const assistantName = assistant?.name ?? "Pochi";
  const latestCheckpoint = useLatestCheckpoint();
  const toolCallCheckpoints = useMemo(
    () => buildToolCallCheckpoints(renderMessages),
    [renderMessages],
  );
  const userEditsCheckpoints = useMemo(
    () => buildUserEditsCheckpoints(renderMessages),
    [renderMessages],
  );
  const lastCheckpointInMessage = useMemo(() => {
    return renderMessages
      .flatMap((msg) => msg.parts)
      .findLast((part) => part.type === "data-checkpoint")?.data.commit;
  }, [renderMessages]);

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

  return (
    <BackgroundJobContextProvider messages={renderMessages}>
      <MermaidContextProvider value={mermaidContextValue}>
        <ScrollArea
          className={cn("mb-2 flex-1 overflow-y-auto px-4", className)}
          viewportClassname={viewportClassname}
          ref={containerRef}
        >
          {renderMessages.map((m, messageIndex) => (
            <div
              key={m.id}
              className="flex flex-col"
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
                    {findCompactPart(m) && (
                      <CompactPartToolTip className="ml-1" message={m} />
                    )}
                  </div>
                )}
                <div
                  className={cn("ml-1 flex flex-col", showUserAvatar && "mt-3")}
                >
                  {m.parts.map((part, index) => (
                    <Part
                      role={m.role}
                      key={index}
                      isLastPartInMessages={
                        index === m.parts.length - 1 &&
                        messageIndex === renderMessages.length - 1
                      }
                      partIndex={index}
                      part={part}
                      isLoading={isLoading}
                      isExecuting={isExecuting}
                      messages={renderMessages}
                      forkTask={forkTask}
                      isSubTask={isSubTask}
                      hideUserEditsActions={hideUserEditsActions}
                      latestCheckpoint={latestCheckpoint}
                      lastCheckpointInMessage={lastCheckpointInMessage}
                      userEditsCheckpoint={userEditsCheckpoints[messageIndex]}
                      toolCallCheckpoints={toolCallCheckpoints}
                    />
                  ))}
                </div>
                {/* Display attachments at the bottom of the message */}
                <UserAttachments message={m} />
                <UserActiveSelections message={m} />
              </div>
              {messageIndex < renderMessages.length - 1 && (
                <SeparatorWithCheckpoint
                  messageIndex={messageIndex}
                  message={m}
                  nextMessage={renderMessages[messageIndex + 1]}
                  isLoading={isLoading || isExecuting}
                  forkTask={forkTask}
                  isSubTask={isSubTask}
                  latestCheckpoint={latestCheckpoint}
                  lastCheckpointInMessage={lastCheckpointInMessage}
                />
              )}
            </div>
          ))}
          {showLoader && (
            <div className="py-2">
              <Loader2
                className={cn(
                  "mx-auto size-6",
                  debouncedIsLoading ? "animate-spin" : "invisible",
                )}
              />
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

function UserActiveSelections({ message }: { message: Message }) {
  const selectionParts = message.parts.filter(
    (part) => part.type === "data-active-selection",
  ) as {
    type: "data-active-selection";
    data: { activeSelection: ActiveSelection };
  }[];

  if (message.role === "user" && selectionParts.length) {
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {selectionParts.map((part, index) => (
          <ActiveSelectionPart
            key={index}
            activeSelection={part.data.activeSelection}
          />
        ))}
      </div>
    );
  }
}

function Part({
  role,
  part,
  partIndex,
  isLastPartInMessages,
  isLoading,
  isExecuting,
  messages,
  forkTask,
  isSubTask,
  latestCheckpoint,
  lastCheckpointInMessage,
  hideUserEditsActions,
  userEditsCheckpoint,
  toolCallCheckpoints,
}: {
  role: Message["role"];
  partIndex: number;
  part: NonNullable<Message["parts"]>[number];
  isLastPartInMessages: boolean;
  isLoading: boolean;
  isExecuting: boolean;
  messages: Message[];
  forkTask?: (commitId: string) => Promise<void>;
  isSubTask?: boolean;
  hideUserEditsActions?: boolean;
  latestCheckpoint: string | null;
  lastCheckpointInMessage: string | undefined;
  userEditsCheckpoint?: {
    origin: string | undefined;
    modified: string | undefined;
  };
  toolCallCheckpoints: Map<string, ToolCallCheckpoint>;
}) {
  const paddingClass = partIndex === 0 ? "" : "mt-2";
  if (part.type === "text") {
    return <MemoTextPartUI className={paddingClass} part={part} />;
  }

  if (part.type === "reasoning") {
    return (
      <MemoReasoningPartUI
        className={paddingClass}
        part={part}
        isLoading={part.state === "streaming"}
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
          isLoading={isLoading || isExecuting}
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

  if (isStaticToolUIPart(part)) {
    return (
      <ToolInvocationPart
        className={paddingClass}
        tool={part}
        isLoading={isLoading}
        changes={toolCallCheckpoints.get(part.toolCallId)}
        messages={messages}
        isSubTask={isSubTask}
        isLastPart={isLastPartInMessages}
      />
    );
  }

  return <div>{JSON.stringify(part)}</div>;
}

function TextPartUI({
  className,
  part,
}: { part: TextUIPart; className?: string }) {
  if (part.text.trim().length === 0) {
    return null; // Skip empty text parts
  }

  if (prompts.isCompact(part.text)) {
    return null; // Skip compact parts
  }

  return <MessageMarkdown className={className}>{part.text}</MessageMarkdown>;
}

const MemoTextPartUI = memo(TextPartUI, (prev, next) => {
  return prev.part.text === next.part.text;
});
MemoTextPartUI.displayName = "MemoTextPartUI";

function ReasoningPartRenderer(props: Parameters<typeof ReasoningPartUI>[0]) {
  return <ReasoningPartUI {...props} />;
}

const MemoReasoningPartUI = memo(ReasoningPartRenderer, (prev, next) => {
  return prev.part.text === next.part.text;
});
MemoReasoningPartUI.displayName = "MemoReasoningPartUI";

const SeparatorWithCheckpoint: React.FC<{
  messageIndex: number;
  message: Message;
  nextMessage: Message;
  isLoading: boolean;
  forkTask?: (commitId: string, messageId?: string) => Promise<void>;
  isSubTask?: boolean;
  latestCheckpoint: string | null;
  lastCheckpointInMessage: string | undefined;
}> = ({
  messageIndex,
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
  if (messageIndex === 0 && message.role === "user") {
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
  if (!checkpointMessage) return sep;

  const part = checkpointMessage.parts.at(-1);
  if (part && part.type === "data-checkpoint" && isVSCodeEnvironment()) {
    return (
      <div className="mt-1 mb-2">
        <CheckpointUI
          checkpoint={part.data}
          isLoading={isLoading}
          hideBorderOnHover={false}
          className="max-w-full"
          forkTask={forkTask}
          restoreMessageId={restoreMessageId}
          isRestored={
            lastCheckpointInMessage !== part.data.commit &&
            latestCheckpoint === part.data.commit
          }
        />
      </div>
    );
  }

  return sep;
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

function CompactPartToolTip({
  message,
  className,
}: { message: Message; className?: string }) {
  const { t } = useTranslation();
  const compactPart = findCompactPart(message);
  const parsed = compactPart && prompts.parseInlineCompact(compactPart.text);
  if (!parsed) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild className={className}>
        <SquareChartGantt
          className="size-5 cursor-pointer"
          onClick={() =>
            vscodeHost.openFile(`/task-summary-${message.id}.md`, {
              base64Data: btoa(unescape(encodeURIComponent(parsed.summary))),
            })
          }
        />
      </TooltipTrigger>
      <TooltipContent sideOffset={2} side="right">
        <p className="m-0 w-48">
          {t("messageList.compactedConversationTooltip")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function buildUserEditsCheckpoints(messages: Message[]) {
  const userEditsCheckpoints: Array<UserEditsCheckpoint | undefined> = [];
  const checkpointHistory: string[] = [];

  for (const [index, message] of messages.entries()) {
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
      userEditsCheckpoints[index] = undefined;
      continue;
    }

    userEditsCheckpoints[index] = {
      origin: checkpointHistory.at(-2),
      modified: checkpointHistory.at(-1),
    };
  }

  return userEditsCheckpoints;
}
