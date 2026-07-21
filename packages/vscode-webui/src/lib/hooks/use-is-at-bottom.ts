import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface UseIsAtBottomOptions {
  /**
   * The threshold in pixels from the bottom to consider "at bottom"
   * @default 150
   */
  threshold?: number;

  /**
   * Whether to initialize as at bottom
   * @default true
   */
  defaultIsAtBottom?: boolean;
}

/**
 * A hook to detect if a scrollable container is at or near the bottom
 *
 * @param containerRef RefObject to the scrollable container element
 * @param options Configuration options
 * @returns An object with:
 *  - isAtBottom: whether the container is currently at/near bottom
 *  - scrollToBottom: function to scroll to the bottom (with optional smooth behavior)
 */
export function useIsAtBottom(
  containerRef: RefObject<HTMLElement | null>,
  options: UseIsAtBottomOptions = {},
) {
  const { threshold = 150, defaultIsAtBottom = true } = options;
  const [isAtBottom, setIsAtBottom] = useState(defaultIsAtBottom);
  const isAtBottomRef = useRef(defaultIsAtBottom);

  // Check if the scroll position is near the bottom
  const checkIfAtBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return true;

    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold;
    isAtBottomRef.current = nearBottom;
    setIsAtBottom(nearBottom);
    return nearBottom;
  }, [containerRef, threshold]);

  const scrollToBottom = useCallback(
    (smooth = true) => {
      const container = containerRef.current;
      if (!container) return;

      isAtBottomRef.current = true;
      setIsAtBottom(true);
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [containerRef],
  );

  const getIsAtBottom = useCallback(() => isAtBottomRef.current, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      checkIfAtBottom();
    };

    const handleResize = () => {
      checkIfAtBottom();
    };

    // Initial check
    checkIfAtBottom();

    container.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleResize);

    return () => {
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [containerRef, checkIfAtBottom]);

  return {
    isAtBottom,
    getIsAtBottom,
    scrollToBottom,
  };
}
