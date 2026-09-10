import { CodeBlock, MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { Check, CheckIcon, CopyIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreatePrAction } from "./create-pr-action";
import {
  getAttemptCompletionResultCopyText,
  getAttemptCompletionResultDisplay,
} from "./tool-result-display";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, isLastPart, isSubTask }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const resultContent = getAttemptCompletionResultDisplay(result);

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
        <div className="flex items-center gap-1">
          <AttemptCompletionCopyAction result={result} />
          {isLastPart && !isSubTask ? <CreatePrAction /> : null}
        </div>
      </div>
      {resultContent.type === "json" ? (
        <CodeBlock language="json" value={resultContent.content} />
      ) : (
        <MessageMarkdown>{resultContent.content}</MessageMarkdown>
      )}
    </div>
  );
};

function AttemptCompletionCopyAction({ result }: { result: unknown }) {
  const { t } = useTranslation();
  const { isCopied, copyToClipboard } = useCopyToClipboard({ timeout: 2000 });
  const label = isCopied
    ? t("commandExecutionPanel.copied")
    : t("codeBlock.copy");

  const onCopy = () => {
    if (isCopied) return;
    copyToClipboard(getAttemptCompletionResultCopyText(result));
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground"
          aria-label={label}
          onClick={onCopy}
        >
          {isCopied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
