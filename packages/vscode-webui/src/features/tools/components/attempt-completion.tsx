import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, isExecuting, isLoading, messages }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const latestAttemptCompletionId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      for (let j = message.parts.length - 1; j >= 0; j--) {
        const part = message.parts[j];
        if (part.type === "tool-attemptCompletion") {
          return part.toolCallId;
        }
      }
    }

    return undefined;
  }, [messages]);
  const hasExistingWalkthrough = useMemo(() => {
    const WALKTHROUGH_PATH_REGEX = /(?:^|\/)[.]?pochi\/walkthroughs\//;

    return messages.some((message) =>
      message.parts.some(
        (part) =>
          part.type === "tool-writeToFile" &&
          typeof part.input?.path === "string" &&
          WALKTHROUGH_PATH_REGEX.test(part.input.path),
      ),
    );
  }, [messages]);
  const isLatestAttemptCompletion =
    toolCall.toolCallId === latestAttemptCompletionId;
  const handleCreateWalkthrough = useCallback(() => {
    // TODO: Wire walkthrough generation to save a markdown summary for this task.
    console.warn("Walkthrough generation is not implemented yet.");
  }, []);
  const showWalkthrough =
    Boolean(result.trim()) &&
    !isExecuting &&
    !isLoading &&
    isLatestAttemptCompletion;
  const walkthroughLabel = hasExistingWalkthrough
    ? t("toolInvocation.updateWalkthrough")
    : t("toolInvocation.createWalkthrough");

  // Return null if there's nothing to display
  if (!result) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
        <Check className="size-4" />
        {t("toolInvocation.taskCompleted")}
      </span>
      <MessageMarkdown>{result}</MessageMarkdown>
      {showWalkthrough ? (
        <Button
          className="self-start"
          size="sm"
          type="button"
          variant="outline"
          onClick={handleCreateWalkthrough}
        >
          {walkthroughLabel}
        </Button>
      ) : null}
    </div>
  );
};
