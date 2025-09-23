import { Dot, Lightbulb } from "lucide-react";

import { MessageMarkdown } from "@/components/message/markdown";
import { cn, tw } from "@/lib/utils";
import type { ReasoningUIPart } from "ai";
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
      <span className="font-medium italic">{assistant} is thinking ...</span>
    </span>
  );

  const detail = <MessageMarkdown>{part.text}</MessageMarkdown>;

  return (
    <div className={className}>
      <ExpandableToolContainer title={title} expandableDetail={detail} />
    </div>
  );
}
