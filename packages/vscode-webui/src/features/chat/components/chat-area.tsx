import { EmptyChatPlaceholder } from "@/components/empty-chat-placeholder";
import { MessageList } from "@/components/message/message-list";
import { useResourceURI } from "@/lib/hooks/use-resource-uri";
import type { Message } from "@getpochi/livekit";
import type React from "react";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  user?: { name: string; image?: string | null };
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  hideEmptyPlaceholder?: boolean;
}

export function ChatArea({
  messages,
  isLoading,
  user,
  messagesContainerRef,
  className,
  hideEmptyPlaceholder,
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
        containerRef={messagesContainerRef}
        className={className}
      />
    </>
  );
}
