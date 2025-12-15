import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, isExecuting, isLoading }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const handleCreateWalkthrough = useCallback(() => {
    // TODO: Wire walkthrough generation to save a markdown summary for this task.
    console.warn("Walkthrough generation is not implemented yet.");
  }, []);
  const showWalkthrough = Boolean(result.trim()) && !isExecuting && !isLoading;

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
          {t("toolInvocation.createWalkthrough")}
        </Button>
      ) : null}
    </div>
  );
};
