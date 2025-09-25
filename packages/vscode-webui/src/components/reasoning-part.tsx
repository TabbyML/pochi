import { Dot, Lightbulb } from "lucide-react";

import { MessageMarkdown } from "@/components/message/markdown";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { cn, tw } from "@/lib/utils";
import type { ReasoningUIPart } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExpandableToolContainer } from "./tool-invocation/tool-container";

interface ReasoningPartUIProps {
  isLoading: boolean;
  part: ReasoningUIPart;
  className?: string;
  assistant: string;
}

export function ReasoningPartUI({
  className,
  part,
  isLoading,
  assistant,
}: ReasoningPartUIProps) {
  const iconClass = tw`text-blue-700 dark:text-blue-300`;
  const [headline, setHeadline] = useDebounceState(
    `${assistant} is thinking ...`,
    750,
  );
  const [isHeadlineChanging, setIsHeadlineChanging] = useState(false);
  const [displayHeadline, setDisplayHeadline] = useState(headline);

  const headlineFromMarkdown = useMemo(
    () => extractThinkingHeadline(part.text),
    [part.text],
  );

  const finishHeadline = `Thought for ${part.text.length} characters`;

  useEffect(() => {
    if (headlineFromMarkdown) {
      setHeadline(headlineFromMarkdown);
    }
  }, [headlineFromMarkdown, setHeadline]);

  // Handle fade animation when headline changes
  useEffect(() => {
    if (headline !== displayHeadline) {
      setIsHeadlineChanging(true);
      // Fade out current headline
      const fadeOutTimer = setTimeout(() => {
        setDisplayHeadline(headline);
        // Fade in new headline
        const fadeInTimer = setTimeout(() => {
          setIsHeadlineChanging(false);
        }, 50);
        return () => clearTimeout(fadeInTimer);
      }, 250);
      return () => clearTimeout(fadeOutTimer);
    }
  }, [headline, displayHeadline]);

  const title = (
    <span className="flex items-center gap-2">
      {isLoading ? (
        <Dot
          className={cn(
            "size-4 scale-150 animate-ping duration-2000",
            iconClass,
          )}
        />
      ) : (
        <Lightbulb className={cn("size-4 scale-90", iconClass)} />
      )}
      <span
        className={cn(
          "font-medium italic transition-opacity duration-300 ease-in-out",
          isHeadlineChanging && isLoading ? "opacity-0" : "opacity-100",
        )}
      >
        {isLoading ? displayHeadline : finishHeadline}
      </span>
    </span>
  );

  const detail = <MessageMarkdown>{part.text}</MessageMarkdown>;

  return (
    <div className={className}>
      <ExpandableToolContainer title={title} expandableDetail={detail} />
    </div>
  );
}

/*
Find last heading in the text. The heading can be in the following formats:
  **Preparing the data**
  # Preparing the data
  ## Preparing the data
  ### Preparing the data
*/
function extractThinkingHeadline(text: string): string | null {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("**") && line.endsWith("**")) {
      return line.slice(2, -2);
    }
    if (line.startsWith("#")) {
      return line.slice(line.indexOf(" ") + 1);
    }
  }
  return null;
}
