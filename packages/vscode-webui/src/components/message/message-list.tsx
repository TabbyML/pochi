import { Loader2, SquareChartGantt, UserIcon } from "lucide-react";
import type React from "react";

import { ReasoningPartUI } from "@/components/reasoning-part.tsx";
import { ToolInvocationPart } from "@/components/tool-invocation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  BackgroundJobContextProvider,
  useToolCallLifeCycle,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import type { Message, UITools } from "@getpochi/livekit";
import {
  type FileUIPart,
  type TextUIPart,
  type ToolUIPart,
  isToolUIPart,
} from "ai";
import { useEffect } from "react";
import { CheckpointUI } from "../checkpoint-ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { MessageAttachments } from "./attachments";
import { MessageMarkdown } from "./markdown";

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
}> = ({
  messages: renderMessages,
  isLoading,
  user = { name: "User" },
  assistant,
  containerRef,
  showUserAvatar = true,
  className,
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

  return (
    <BackgroundJobContextProvider messages={renderMessages}>
      <ScrollArea
        className={cn("mb-2 flex-1 overflow-y-auto px-4", className)}
        ref={containerRef}
      >
        {renderMessages.map((m, messageIndex) => (
          <div key={m.id} className="flex flex-col">
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
                    assistant={assistantName}
                  />
                ))}
              </div>
              {/* Display attachments at the bottom of the message */}
              <UserAttachments message={m} />
            </div>
            {messageIndex < renderMessages.length - 1 && (
              <SeparatorWithCheckpoint
                message={m}
                isLoading={isLoading || isExecuting}
              />
            )}
          </div>
        ))}
        {debouncedIsLoading && (
          <div className="py-2">
            <Loader2 className="mx-auto size-6 animate-spin" />
          </div>
        )}
      </ScrollArea>
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

function Part({
  role,
  part,
  partIndex,
  isLastPartInMessages,
  isLoading,
  isExecuting,
  messages,
  assistant,
}: {
  role: Message["role"];
  partIndex: number;
  part: NonNullable<Message["parts"]>[number];
  isLastPartInMessages: boolean;
  isLoading: boolean;
  isExecuting: boolean;
  messages: Message[];
  assistant: string;
}) {
  const paddingClass = partIndex === 0 ? "" : "mt-2";
  if (part.type === "text") {
    return <TextPartUI className={paddingClass} part={part} />;
  }

  if (part.type === "reasoning") {
    return (
      <ReasoningPartUI
        className={paddingClass}
        part={part}
        isLoading={isLastPartInMessages}
        assistant={assistant}
      />
    );
  }

  if (part.type === "step-start" || part.type === "file") {
    return;
  }

  if (part.type === "data-checkpoint") {
    if (role === "assistant" && isVSCodeEnvironment()) {
      return (
        <CheckpointUI
          checkpoint={part.data}
          isLoading={isLoading || isExecuting}
        />
      );
    }
    return null;
  }

  if (isToolUIPart(part)) {
    return (
      <ToolInvocationPart
        className={paddingClass}
        tool={part}
        isLoading={isLoading}
        changes={getToolCallCheckpoint(part, messages)}
        messages={messages}
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

const SeparatorWithCheckpoint: React.FC<{
  message: Message;
  isLoading: boolean;
}> = ({ message, isLoading }) => {
  const sep = <Separator className="mt-1 mb-2" />;
  if (message.role === "assistant") return sep;
  const part = message.parts.at(-1);
  if (part && part.type === "data-checkpoint" && isVSCodeEnvironment()) {
    return (
      <div className="mt-1 mb-2">
        <CheckpointUI
          checkpoint={part.data}
          isLoading={isLoading}
          hideBorderOnHover={false}
          className="max-w-full"
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

const getToolCallCheckpoint = (
  part: ToolUIPart<UITools>,
  messages: Message[],
): ToolCallCheckpoint => {
  const allParts = messages.flatMap((msg) => msg.parts);

  const currentIndex = allParts.findIndex(
    (p) => isToolUIPart(p) && p.toolCallId === part.toolCallId,
  );

  const beforeCheckpoint = findCheckpointPart(allParts);
  const afterCheckpoint = findCheckpointPart(allParts.slice(currentIndex + 1));

  return {
    origin: beforeCheckpoint?.data.commit,
    modified: afterCheckpoint?.data.commit,
  };
};

function findCheckpointPart(parts: Message["parts"]) {
  for (const x of parts) {
    if (x.type === "data-checkpoint") {
      return x;
    }
  }
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
          Conversation has been compacted from this point onward to reduce token
          usage
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
