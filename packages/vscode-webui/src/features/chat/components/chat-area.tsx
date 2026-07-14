import { EmptyChatPlaceholder } from "@/components/empty-chat-placeholder";
import type { MermaidContext } from "@/components/message/mermaid-context";
import { MessageList } from "@/components/message/message-list";
import { useResourceURI } from "@/lib/hooks/use-resource-uri";
import type { Message } from "@getpochi/livekit";
import type React from "react";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  loadingLabel?: string;
  user?: { name: string; image?: string | null };
  messagesContainerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  hideEmptyPlaceholder?: boolean;
  forkTask?: (commitId: string, messageId?: string) => Promise<void>;
  isSubTask?: boolean;
  repairMermaid?: MermaidContext["repairMermaid"];
  repairingChart?: string | null;
  showLastStepDuration?: boolean;
}

export function ChatArea({
  messages,
  isLoading,
  loadingLabel,
  user,
  messagesContainerRef,
  className,
  hideEmptyPlaceholder,
  forkTask,
  isSubTask,
  repairMermaid,
  repairingChart,
  showLastStepDuration,
}: ChatAreaProps) {
  const resourceUri = useResourceURI();
  return (
    <>
      {!hideEmptyPlaceholder && messages.length === 0 && (
        <EmptyChatPlaceholder />
      )}
      {messages.length > 0 && <div className="h-4" />}
      <MessageList
        messages={messages}
        user={user}
        assistant={{
          name: "Pochi",
          image: resourceUri?.logo128,
        }}
        isLoading={isLoading}
        loadingLabel={loadingLabel}
        containerRef={messagesContainerRef}
        className={className}
        forkTask={forkTask}
        isSubTask={isSubTask}
        repairMermaid={repairMermaid}
        repairingChart={repairingChart}
        showLastStepDuration={showLastStepDuration}
      />
    </>
  );
}
