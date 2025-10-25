import { MessageMarkdown } from "@/components/message";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "../types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};

  // Return null if there's nothing to display
  if (!result) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
        <Check className="size-4" />
        {t("toolInvocation.taskCompleted")}
      </span>
      <MessageMarkdown>{result}</MessageMarkdown>
    </div>
  );
};
