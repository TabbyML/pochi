import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/features/chat";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { isToolUIPart } from "ai";
import { Check, GitPullRequest } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, messages }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const sendMessage = useSendMessage();

  const { data: currentWorkspace } = useCurrentWorkspace();
  const { worktrees } = useWorktrees();

  const currentWorktree = useMemo(() => {
    if (!worktrees || !currentWorkspace) return null;
    return worktrees.find((wt) => wt.path === currentWorkspace.workspacePath);
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

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
          <Check className="size-4" />
          {t("toolInvocation.taskCompleted")}
        </span>
        {isLastPart && !hasPR && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-muted-foreground text-xs"
            onClick={onClickCreatePR}
          >
            <GitPullRequest className="size-3.5" />
            {t("worktree.createPr")}
          </Button>
        )}
      </div>
      <MessageMarkdown>{result}</MessageMarkdown>
    </div>
  );
};
