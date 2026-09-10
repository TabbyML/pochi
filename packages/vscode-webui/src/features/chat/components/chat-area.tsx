import { EmptyChatPlaceholder } from "@/components/empty-chat-placeholder";
import type { MermaidContext } from "@/components/message/mermaid-context";
import { MessageList } from "@/components/message/message-list";
import { useResourceURI } from "@/lib/hooks/use-resource-uri";
import { formatters } from "@getpochi/common";
import type { Message, Task } from "@getpochi/livekit";
import type React from "react";

const defaultFormatMessages = (messages: Message[]) => formatters.ui(messages);

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
  taskStatus?: Task["status"];
  renderAllMessages?: boolean;
  formatMessages?: (messages: Message[]) => Message[];
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
  taskStatus,
  renderAllMessages,
  formatMessages = defaultFormatMessages,
}: ChatAreaProps) {
  const resourceUri = useResourceURI();
  return (
    <>
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
        taskStatus={taskStatus}
        renderAllMessages={renderAllMessages}
        formatMessages={formatMessages}
        emptyPlaceholder={
          !hideEmptyPlaceholder ? <EmptyChatPlaceholder /> : undefined
        }
      />
    </>
  );
}
