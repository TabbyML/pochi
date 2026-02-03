import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSendMessage } from "@/features/chat";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { prompts } from "@getpochi/common";
import { isToolUIPart } from "ai";
import { Check, Footprints, GitPullRequest } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, messages, isSubTask }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const sendMessage = useSendMessage();

  const { data: currentWorkspace } = useCurrentWorkspace();
  const { worktrees } = useWorktrees();

  const currentWorktree = useMemo(() => {
    if (!worktrees || !currentWorkspace) return null;
    return worktrees.find((wt) => wt.path === currentWorkspace.cwd);
  }, [worktrees, currentWorkspace]);

  const hasPR = !!currentWorktree?.data?.github?.pullRequest;

  const isLastPart = useMemo(() => {
    if (!messages || messages.length === 0) return false;
    const lastMessage = messages[messages.length - 1];

    // Check if tool is in last message
    const partIndex = lastMessage.parts.findIndex(
      (p) => isToolUIPart(p) && p.toolCallId === toolCall.toolCallId,
    );

    if (partIndex === -1) return false;

    // Check if it is the last part
    return partIndex === lastMessage.parts.length - 1;
  }, [messages, toolCall.toolCallId]);

  // Return null if there's nothing to display
  if (!result) {
    return null;
  }

  const onClickCreatePR = () => {
    sendMessage({ prompt: "Please create a PR for the changes above" });
  };

  const onClickCreateWalkthrough = () => {
    sendMessage({
      prompt: `${prompts.customAgent("walkthrough")} Please create a walkthrough for the changes above`,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
          <Check className="size-4" />
          {t("toolInvocation.taskCompleted")}
        </span>
        {!!currentWorkspace && isLastPart && !isSubTask && (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  onClick={onClickCreateWalkthrough}
                >
                  <Footprints className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("worktree.createWalkthrough")}</TooltipContent>
            </Tooltip>
            {!hasPR && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground"
                    onClick={onClickCreatePR}
                  >
                    <GitPullRequest className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("worktree.createPr")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <MessageMarkdown>{result}</MessageMarkdown>
    </div>
  );
};
