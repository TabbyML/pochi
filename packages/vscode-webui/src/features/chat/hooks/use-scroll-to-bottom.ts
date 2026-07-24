import { useIsAtBottom } from "@/lib/hooks/use-is-at-bottom";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

interface UseScrollToBottomProps {
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  lastUserMessageId?: string;
}

export function useScrollToBottom({
  messagesContainerRef,
  lastUserMessageId,
}: UseScrollToBottomProps) {
  const { getIsAtBottom, scrollToBottom } = useIsAtBottom(messagesContainerRef);
  const lastObservedUserMessageIdRef = useRef(lastUserMessageId);

  // Scroll to bottom when the message list height changes
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container?.children[0]) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      if (getIsAtBottom()) {
        requestAnimationFrame(() => scrollToBottom());
      }
    });
    resizeObserver.observe(container);
    resizeObserver.observe(container.children[0]);
    return () => {
      resizeObserver.disconnect();
    }; // clean up
  }, [getIsAtBottom, scrollToBottom, messagesContainerRef]);

  // Scroll to bottom immediately when a user message is sent.
  useLayoutEffect(() => {
    if (!lastUserMessageId) {
      return;
    }

    if (lastObservedUserMessageIdRef.current === lastUserMessageId) {
      return;
    }

    lastObservedUserMessageIdRef.current = lastUserMessageId;
    scrollToBottom(false);
  }, [lastUserMessageId, scrollToBottom]);

  // Initial scroll to bottom once when component mounts (without smooth behavior)
  useLayoutEffect(() => {
    if (messagesContainerRef.current) {
      scrollToBottom(false); // false = not smooth
    }
  }, [scrollToBottom, messagesContainerRef]);

  const onToolCallApprovalVisible = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return {
    onToolCallApprovalVisible,
  };
}
