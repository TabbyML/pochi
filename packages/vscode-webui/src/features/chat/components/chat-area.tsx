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
  agent?: string;
}

export function ChatArea({
  messages,
  isLoading,
  user,
  messagesContainerRef,
  agent,
}: ChatAreaProps) {
  const resourceUri = useResourceURI();
  return (
    <>
      {messages.length === 0 && <EmptyChatPlaceholder />}
      {messages.length > 0 && <div className="h-4" />}
      <MessageList
        messages={messages}
        user={user}
        assistant={{
          name: agent ?? "Pochi",
          image: resourceUri?.logo128,
        }}
        isLoading={isLoading}
        containerRef={messagesContainerRef}
      />
    </>
  );
}
