import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSendMessage } from "@/features/chat";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { GitPullRequest } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * A "Create PR" action button. Renders nothing when there is no active
 * workspace or when the current worktree already has an open pull request.
 */
export const CreatePrAction: React.FC = () => {
  const { t } = useTranslation();
  const sendMessage = useSendMessage();
  const { data: currentWorkspace } = useCurrentWorkspace();
  const { worktrees } = useWorktrees();

  const currentWorktree = useMemo(() => {
    if (!worktrees || !currentWorkspace) return null;
    return worktrees.find((wt) => wt.path === currentWorkspace.cwd);
  }, [worktrees, currentWorkspace]);

  const hasPR = !!currentWorktree?.data?.github?.pullRequest;

  if (!currentWorkspace || hasPR) {
    return null;
  }

  const onClickCreatePR = () => {
    sendMessage({ prompt: "Please create a PR for the changes above" });
  };

  return (
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
  );
};
