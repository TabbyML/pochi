import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { vscodeHost } from "@/lib/vscode";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, isExecuting, isLoading, messages, taskId }) => {
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
  const [hasExistingWalkthrough, setHasExistingWalkthrough] = useState(false);

  useEffect(() => {
    const checkWalkthroughFile = async () => {
      if (!taskId) {
        setHasExistingWalkthrough(false);
        return;
      }

      try {
        // Check if walkthrough file exists in .pochi/walkthroughs directory
        const walkthroughPath = `.pochi/walkthroughs/${taskId}.md`;
        const fileExists = await vscodeHost.checkFileExists(walkthroughPath);
        console.log(
          `[Frontend] checkFileExists for ${walkthroughPath}: ${fileExists}`,
        );
        setHasExistingWalkthrough(fileExists);
      } catch (error) {
        console.error(
          "[Frontend] Failed to check walkthrough file existence:",
          error,
        );
        setHasExistingWalkthrough(false);
      }
    };

    checkWalkthroughFile();
  }, [taskId]);
  const isLatestAttemptCompletion =
    toolCall.toolCallId === latestAttemptCompletionId;
  const handleCreateWalkthrough = useCallback(() => {
    console.log(
      "[Frontend] Create walkthrough button clicked, taskId:",
      taskId,
    );
    if (!taskId) {
      console.warn("[Frontend] No taskId available for walkthrough generation");
      return;
    }
    console.log(
      "[Frontend] Calling vscodeHost.generateWalkthrough with taskId:",
      taskId,
      "messages count:",
      messages.length,
    );
    console.log("[Frontend] First few messages:", messages.slice(0, 2));

    vscodeHost
      .generateWalkthrough(taskId, messages)
      .then(() => {
        console.log(
          "[Frontend] vscodeHost.generateWalkthrough completed successfully",
        );
        // Re-check if walkthrough file exists now
        const walkthroughPath = `.pochi/walkthroughs/${taskId}.md`;
        vscodeHost
          .checkFileExists(walkthroughPath)
          .then((fileExists) => {
            console.log(
              `[Frontend] After generation, checkFileExists for ${walkthroughPath}: ${fileExists}`,
            );
            setHasExistingWalkthrough(fileExists);
          })
          .catch((error) => {
            console.error(
              "[Frontend] Failed to re-check walkthrough file existence:",
              error,
            );
          });
      })
      .catch((error) => {
        console.error("[Frontend] Failed to generate walkthrough:", error);
      });
  }, [taskId, messages]);
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
