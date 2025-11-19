import { useIsDevMode } from "@/features/settings";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "./ui/scroll-area";

interface ErrorMessageProps {
  error: { message: string } | undefined;
  formatter?: (e: { message: string }) => ReactNode;
  collapsible?: boolean;
  viewportClassname?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  error,
  formatter,
  collapsible = false,
  viewportClassname,
}) => {
  const [isDevMode] = useIsDevMode();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const errorMessage = error?.message;

  const checkOverflow = useCallback(() => {
    if (collapsible && contentRef.current) {
      const lineHeight = Number.parseFloat(
        window.getComputedStyle(contentRef.current).lineHeight || "20",
      );
      const height = contentRef.current.scrollHeight;
      setHasOverflow(height > lineHeight * 1.5);
    }
  }, [collapsible]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Need to reset state when error changes
  useEffect(() => {
    checkOverflow();
    setIsExpanded(false);
  }, [errorMessage, checkOverflow]);

  useEffect(() => {
    if (!collapsible || !contentRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [collapsible, checkOverflow]);

  const handleToggle = () => {
    if (hasOverflow) {
      setIsExpanded(!isExpanded);
    }
  };

  const isCollapsed = collapsible && hasOverflow && !isExpanded;

  return (
    error && (
      <div className="relative mb-2">
        {(() => {
          const content = (
            <div ref={contentRef}>
              {formatter ? formatter(error) : error.message}
            </div>
          );

          return isCollapsed ? (
            <div
              className={cn(
                "max-h-6 overflow-hidden break-all pr-8 text-center text-error",
                {
                  "cursor-help": isDevMode,
                },
              )}
              onClick={isDevMode ? () => console.error(error) : undefined}
            >
              {content}
            </div>
          ) : (
            <ScrollArea
              className={cn("break-all text-center text-error", {
                "cursor-help": isDevMode && (!collapsible || !hasOverflow),
                "pr-8": collapsible && hasOverflow,
              })}
              viewportClassname={cn(
                "max-h-[max(1.5rem,calc(100vh-38rem))]",
                viewportClassname,
              )}
              onClick={
                isDevMode && (!collapsible || !hasOverflow)
                  ? () => console.error(error)
                  : undefined
              }
            >
              {content}
            </ScrollArea>
          );
        })()}
        {collapsible && hasOverflow && (
          <button
            type="button"
            onClick={handleToggle}
            className="absolute top-1.5 right-2 transition-opacity hover:opacity-80"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronUpIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
          </button>
        )}
      </div>
    )
  );
};
