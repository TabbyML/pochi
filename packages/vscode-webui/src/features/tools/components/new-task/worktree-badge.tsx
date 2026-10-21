import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDefaultStore } from "@/lib/use-default-store";
import { getSubagentWorktreeId } from "@getpochi/common";
import { WorktreePrefix } from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

/** Marks a subagent that runs in its own isolated worktree. */
export function SubagentWorktreeBadge({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  if (!task?.cwd) return null;
  const label = t("subtask.isolatedWorktree");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          data-testid="subagent-worktree-badge"
          className="flex h-5 shrink-0 cursor-default select-none items-center self-start text-muted-foreground text-sm leading-none"
        >
          {WorktreePrefix}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-80 text-wrap py-2">
        <p className="mb-1.5 font-medium">{`${WorktreePrefix} ${label}`}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">
            {t("subtask.worktreeBranch")}
          </dt>
          <dd className="font-mono">{`subagent/${getSubagentWorktreeId(taskId)}`}</dd>
          <dt className="text-muted-foreground">{t("subtask.worktreePath")}</dt>
          <dd className="font-mono">
            <PathWithBreaks path={task.cwd} />
          </dd>
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

/** Lets a long path wrap only after its separators. */
function PathWithBreaks({ path }: { path: string }) {
  return path.split(/(?<=[/\\])/).map((segment, i) => (
    <Fragment key={i}>
      {segment}
      <wbr />
    </Fragment>
  ));
}
