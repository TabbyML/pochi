import { MessageList } from "@/components/message/message-list";
import { useIsAtBottom } from "@/lib/hooks/use-is-at-bottom";
import { cn } from "@/lib/utils";
import { formatters } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "./ui/scroll-area";

export type TaskThreadSource = {
  messages: Message[];
  todos: Todo[];
  isLoading?: boolean;
};

export const TaskThread: React.FC<{
  source: TaskThreadSource;
  user?: {
    name: string;
    image?: string | null;
  };
  assistant?: {
    name: string;
    image?: string | null;
  };
  showMessageList?: boolean;
  showTodos?: boolean;
  scrollAreaClassName?: string;
}> = ({
  source,
  user,
  assistant,
  showMessageList = true,
  showTodos = true,
  scrollAreaClassName,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    if (!source) {
      return;
    }

    setIsLoading(source.isLoading ?? false);
    setMessages(source.messages);
    setTodos(source.todos);
  }, [source]);

  const renderMessages = useMemo(() => prepareForRender(messages), [messages]);
  const newTaskContainer = useRef<HTMLDivElement>(null);
  const { isAtBottom, scrollToBottom } = useIsAtBottom(newTaskContainer);
  const isAtBottomRef = useRef(isAtBottom);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // Scroll to bottom when the message list height changes
  useEffect(() => {
    if (!showMessageList) {
      return;
    }
    const container = newTaskContainer.current;
    if (!container?.children[0]) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom());
      }
    });
    resizeObserver.observe(container);
    resizeObserver.observe(container.children[0]);
    return () => {
      resizeObserver.disconnect();
    }; // clean up
  }, [scrollToBottom, showMessageList]);

  // Initial scroll to bottom once when component mounts (without smooth behavior)
  useLayoutEffect(() => {
    if (newTaskContainer.current) {
      scrollToBottom(false); // false = not smooth
    }
  }, [scrollToBottom]);

  return (
    <div className="flex flex-col">
      {showTodos && todos && todos.length > 0 && (
        <div className="my-1 flex flex-col px-2 py-1">
          {todos
            .filter((x) => x.status !== "cancelled")
            .map((todo) => (
              <span
                key={todo.id}
                className={cn("text-sm", {
                  "line-through": todo.status === "completed",
                })}
              >
                • {todo.content}
              </span>
            ))}
        </div>
      )}
      {showMessageList && (
        <ScrollArea ref={newTaskContainer}>
          <MessageList
            className={cn("px-1 py-0.5", {
              "mt-2": !renderMessages.length,
            })}
            viewportClassname={cn(
              "max-h-[300px] my-1 rounded-sm border",
              scrollAreaClassName,
            )}
            showUserAvatar={false}
            messages={renderMessages}
            user={user}
            assistant={assistant}
            isLoading={isLoading}
            containerRef={undefined}
            showLoader={false}
            isSubTask={true}
          />
        </ScrollArea>
      )}
    </div>
  );
};

/**
 * Filter out askFollowupQuestion if it's the last tool call in the last message.
 * This prevents showing the follow-up question UI in subtasks.
 */
function filterTrailingAskFollowupQuestion(messages: Message[]): Message[] {
  if (messages.length === 0) return messages;

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== "assistant") return messages;

  const parts = lastMessage.parts;
  if (!Array.isArray(parts) || parts.length === 0) return messages;

  // Check if the last part is an askFollowupQuestion
  const lastPart = parts[parts.length - 1];
  if (lastPart.type === "tool-askFollowupQuestion") {
    // Remove the askFollowupQuestion tool call from the message
    const filteredParts = parts.slice(0, -1);
    if (filteredParts.length === 0) {
      // If no parts left, remove the entire message
      return messages.slice(0, -1);
    }
    return [...messages.slice(0, -1), { ...lastMessage, parts: filteredParts }];
  }

  return messages;
}

function prepareForRender(messages: Message[]): Message[] {
  // Remove user messages.
  const filteredMessages = messages.filter((x) => x.role !== "user");
  // Filter out trailing askFollowupQuestion tool calls
  const withoutTrailingAskFollowup =
    filterTrailingAskFollowupQuestion(filteredMessages);
  const x = formatters.ui(withoutTrailingAskFollowup);
  return x;
}
