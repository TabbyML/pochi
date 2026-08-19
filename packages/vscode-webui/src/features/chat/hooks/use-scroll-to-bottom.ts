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
  const shouldAutoFollowRef = useRef(true);

  // Scroll to bottom when the message list height changes
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container?.children[0]) {
      return;
    }
    let previousScrollTop = container.scrollTop;
    const onScroll = () => {
      const scrollTop = container.scrollTop;
      const distanceToBottom =
        container.scrollHeight - scrollTop - container.clientHeight;
      if (distanceToBottom <= 1) {
        shouldAutoFollowRef.current = true;
      } else if (scrollTop < previousScrollTop - 1) {
        shouldAutoFollowRef.current = false;
      } else if (getIsAtBottom()) {
        shouldAutoFollowRef.current = true;
      }
      previousScrollTop = scrollTop;
    };
    const followResize = () => {
      if (!shouldAutoFollowRef.current) return;
      scrollToBottom();
    };
    const resizeObserver = new ResizeObserver(() => {
      if (!shouldAutoFollowRef.current) return;
      requestAnimationFrame(followResize);
    });
    container.addEventListener("scroll", onScroll, { passive: true });
    resizeObserver.observe(container);
    resizeObserver.observe(container.children[0]);
    return () => {
      container.removeEventListener("scroll", onScroll);
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
    shouldAutoFollowRef.current = true;
    scrollToBottom(false);
  }, [lastUserMessageId, scrollToBottom]);

  // Initial scroll to bottom once when component mounts (without smooth behavior)
  useLayoutEffect(() => {
    if (!messagesContainerRef.current) return;
    scrollToBottom(false); // false = not smooth
  }, [scrollToBottom, messagesContainerRef]);

  const onToolCallApprovalVisible = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return {
    onToolCallApprovalVisible,
  };
}
