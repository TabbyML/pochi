import { CodeBlock, MessageMarkdown } from "@/components/message";
import { isStaticToolUIPart } from "ai";
import { Check } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CreatePrAction } from "./create-pr-action";
import { getAttemptCompletionResultDisplay } from "./tool-result-display";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, messages, isSubTask }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const resultContent = getAttemptCompletionResultDisplay(result);

  const isLastPart = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    // Check if tool is in last message
    const partIndex = lastMessage.parts.findIndex(
      (p) => isStaticToolUIPart(p) && p.toolCallId === toolCall.toolCallId,
    );

    if (partIndex === -1) return false;

    // Check if it is the last part
    return partIndex === lastMessage.parts.length - 1;
  }, [messages, toolCall.toolCallId]);

  // Return null if there's nothing to display
  if (!resultContent.content) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
          <Check className="size-4" />
          {t("toolInvocation.taskCompleted")}
        </span>
        {isLastPart && !isSubTask && (
          <div className="flex items-center gap-1">
            <CreatePrAction />
          </div>
        )}
      </div>
      {resultContent.type === "json" ? (
        <CodeBlock language="json" value={resultContent.content} />
      ) : (
        <MessageMarkdown>{resultContent.content}</MessageMarkdown>
      )}
    </div>
  );
};
