import { useIsAtBottom } from "@/lib/hooks/use-is-at-bottom";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

interface UseScrollToBottomProps {
  enabled?: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  lastUserMessageId?: string;
}

const AutoFollowPauseThresholdPx = 40;
const NearBottomThresholdPx = 150;

export function useScrollToBottom({
  enabled = true,
  messagesContainerRef,
  lastUserMessageId,
}: UseScrollToBottomProps) {
  const { scrollToBottom } = useIsAtBottom(messagesContainerRef);
  const lastObservedUserMessageIdRef = useRef(lastUserMessageId);
  const shouldAutoFollowRef = useRef(true);
  const userScrollUpDistanceRef = useRef(0);

  // Scroll to bottom when the message list height changes
  useEffect(() => {
    if (!enabled) return;
    const container = messagesContainerRef.current;
    if (!container?.children[0]) {
      return;
    }
    const scrollArea =
      container.closest<HTMLElement>('[data-slot="scroll-area"]') ?? container;
    let isDraggingScrollbar = false;
    let resizeAnimationFrame: number | undefined;
    let resizeAnimationFramePending = false;
    let previousScrollTop = container.scrollTop;
    let previousTouchY: number | undefined;
    let userScrollDirection: "up" | "down" | undefined;
    const isFromCurrentScrollArea = (target: EventTarget | null) =>
      target instanceof Element &&
      (target.closest('[data-slot="scroll-area"]') ?? container) === scrollArea;
    const markUserScroll = (direction: "up" | "down") => {
      userScrollDirection = direction;
      if (direction === "down") {
        userScrollUpDistanceRef.current = 0;
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!isFromCurrentScrollArea(event.target)) return;
      markUserScroll(event.deltaY < 0 ? "up" : "down");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (!isFromCurrentScrollArea(target)) return;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches("input, textarea, select, button"))
      ) {
        return;
      }
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
        markUserScroll("up");
      } else if (["ArrowDown", "PageDown", "End"].includes(event.key)) {
        markUserScroll("down");
      } else if (event.key === " ") {
        markUserScroll(event.shiftKey ? "up" : "down");
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!isFromCurrentScrollArea(target)) return;
      if (event.pointerType === "touch") {
        previousTouchY = event.clientY;
        return;
      }
      const scrollbar =
        target instanceof Element
          ? target.closest('[data-slot="scroll-area-scrollbar"]')
          : null;
      isDraggingScrollbar =
        scrollbar?.closest('[data-slot="scroll-area"]') === scrollArea;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (
        event.pointerType !== "touch" ||
        previousTouchY === undefined ||
        !isFromCurrentScrollArea(event.target)
      ) {
        return;
      }
      if (event.clientY !== previousTouchY) {
        markUserScroll(event.clientY > previousTouchY ? "up" : "down");
        previousTouchY = event.clientY;
      }
    };
    const onPointerEnd = () => {
      isDraggingScrollbar = false;
      previousTouchY = undefined;
    };
    const onScroll = () => {
      const scrollTop = container.scrollTop;
      const delta = scrollTop - previousScrollTop;
      if (isDraggingScrollbar && delta !== 0) {
        markUserScroll(delta < 0 ? "up" : "down");
      }
      const distanceToBottom =
        container.scrollHeight - scrollTop - container.clientHeight;
      if (userScrollDirection === "up" && delta < 0) {
        userScrollUpDistanceRef.current -= delta;
        if (userScrollUpDistanceRef.current >= AutoFollowPauseThresholdPx) {
          shouldAutoFollowRef.current = false;
        }
      } else if (
        userScrollDirection === "down" &&
        delta > 0 &&
        distanceToBottom <= NearBottomThresholdPx
      ) {
        shouldAutoFollowRef.current = true;
        userScrollUpDistanceRef.current = 0;
      }
      previousScrollTop = scrollTop;
      userScrollDirection = undefined;
    };
    const resizeObserver = new ResizeObserver(() => {
      if (!shouldAutoFollowRef.current || resizeAnimationFramePending) return;
      resizeAnimationFramePending = true;
      resizeAnimationFrame = requestAnimationFrame(() => {
        resizeAnimationFramePending = false;
        resizeAnimationFrame = undefined;
        if (shouldAutoFollowRef.current) {
          scrollToBottom(false);
        }
      });
    });
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("scroll", onScroll, { passive: true });
    scrollArea.addEventListener("pointerdown", onPointerDown, true);
    scrollArea.addEventListener("pointermove", onPointerMove, true);
    scrollArea.addEventListener("pointerup", onPointerEnd, true);
    scrollArea.addEventListener("pointercancel", onPointerEnd, true);
    resizeObserver.observe(container);
    resizeObserver.observe(container.children[0]);
    return () => {
      if (resizeAnimationFramePending && resizeAnimationFrame !== undefined) {
        cancelAnimationFrame(resizeAnimationFrame);
      }
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("scroll", onScroll);
      scrollArea.removeEventListener("pointerdown", onPointerDown, true);
      scrollArea.removeEventListener("pointermove", onPointerMove, true);
      scrollArea.removeEventListener("pointerup", onPointerEnd, true);
      scrollArea.removeEventListener("pointercancel", onPointerEnd, true);
      resizeObserver.disconnect();
    }; // clean up
  }, [enabled, scrollToBottom, messagesContainerRef]);

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
    userScrollUpDistanceRef.current = 0;
    scrollToBottom(false);
  }, [lastUserMessageId, scrollToBottom]);

  // Initial scroll to bottom once when component mounts (without smooth behavior)
  useLayoutEffect(() => {
    if (!enabled) return;
    if (!messagesContainerRef.current) return;
    scrollToBottom(false); // false = not smooth
  }, [enabled, scrollToBottom, messagesContainerRef]);

  const onToolCallApprovalVisible = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return {
    onToolCallApprovalVisible,
  };
}
