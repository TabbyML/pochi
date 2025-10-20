import { Dot, Lightbulb } from "lucide-react";

import { MessageMarkdown } from "@/components/message/markdown";
import { cn, tw } from "@/lib/utils";
import type { ReasoningUIPart } from "ai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExpandableToolContainer } from "./tool-invocation/tool-container";

interface ReasoningPartUIProps {
  isLoading: boolean;
  part: ReasoningUIPart;
  className?: string;
}

export function ReasoningPartUI({
  className,
  part,
  isLoading,
}: ReasoningPartUIProps) {
  const { t } = useTranslation();
  const iconClass = tw`text-blue-700 dark:text-blue-300`;
  const headlineFromMarkdown = useMemo(
    () => extractThinkingHeadline(part.text),
    [part.text],
  );

  const headline = useMemo(
    () => headlineFromMarkdown || "Thinking ...",
    [headlineFromMarkdown],
  );
  const finishHeadline = t("reasoning.thoughtFor", { count: part.text.length });
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
      <span className="font-medium italic">
        {isLoading ? headline : finishHeadline}
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
      return line.slice(2, -2).trim();
    }
    if (line.startsWith("#")) {
      return line.slice(line.indexOf(" ") + 1).trim();
    }
  }
  return null;
}
