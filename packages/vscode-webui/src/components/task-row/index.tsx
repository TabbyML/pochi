import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { parseTitle } from "@getpochi/common/message-utils";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { Task, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import {
  CheckCircle2,
  Edit3,
  GitBranch,
  HelpCircle,
  ListTreeIcon,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineErrorOutline } from "react-icons/md";
import { ToolCallLite } from "./tool-call-lite";

export function TaskRow({
  task,
  worktreeName,
  isWorktreeExist,
}: {
  task: Task;
  worktreeName?: string;
  isWorktreeExist?: boolean;
}) {
  const { jwt } = usePochiCredentials();

  const title = useMemo(() => parseTitle(task.title), [task.title]);

  const content = (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border border-border/50 bg-card transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-md",
        "border-l-4",
        getStatusBorderColor(task.status),
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1 overflow-hidden">
            <GitBadge
              git={task.git}
              worktreeName={worktreeName}
              className="max-w-full text-muted-foreground/80 text-xs"
              isWorktreeExist={isWorktreeExist}
            />
            <h3 className="line-clamp-2 flex-1 font-medium text-foreground leading-relaxed transition-colors duration-200 group-hover:text-foreground/80">
              {title}
            </h3>
            <div className="text-muted-foreground">
              {!!task.pendingToolCalls?.length && (
                <PendingToolCallView
                  tools={task.pendingToolCalls as Array<ToolUIPart<UITools>>}
                  isExecuting
                />
              )}
            </div>
          </div>
          <div className="mt-0.5 shrink-0">
            <TaskStatusIcon status={task.status} />
          </div>
        </div>
      </div>
    </div>
  );

  const storeId = encodeStoreId(jwt, task.parentId || task.id);

  const openTaskInPanel = useCallback(() => {
    if (task.cwd) {
      vscodeHost.openTaskInPanel({
        cwd: task.cwd,
        uid: task.id,
        storeId,
      });
    }
  }, [task.cwd, task.id, storeId]);

  return <div onClick={openTaskInPanel}>{content}</div>;
}

const TaskStatusIcon = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const iconProps = { className: "size-5 text-muted-foreground" };
  switch (status) {
    case "streaming":
    case "pending-tool":
    case "pending-input":
    case "pending-model":
      return (
        <Edit3 {...iconProps} aria-label={t("tasksPage.status.pendingInput")} />
      );
    case "completed":
      return (
        <CheckCircle2
          {...iconProps}
          aria-label={t("tasksPage.status.completed")}
        />
      );
    case "failed":
      return (
        <MdOutlineErrorOutline
          {...iconProps}
          aria-label={t("tasksPage.status.failed")}
        />
      );
    default:
      return (
        <HelpCircle
          {...iconProps}
          aria-label={t("tasksPage.status.unknown", { status })}
        />
      );
  }
};

const getStatusBorderColor = (status: string): string => {
  switch (status) {
    case "streaming":
    case "pending-tool":
    case "pending-input":
      return "border-l-muted-foreground/60";
    case "completed":
      return "border-l-muted-foreground/30";
    case "failed":
      return "border-l-muted-foreground/80";
    default:
      return "border-l-muted-foreground/50";
  }
};

function PendingToolCallView({
  tools,
}: {
  tools: ToolUIPart<UITools>[];
  isExecuting: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-1 text-muted-foreground")}>
      <ToolCallLite tools={tools} />
      {/* {tools.length > 1 && <span>More</span>} */}
    </div>
  );
}

function GitBadge({
  className,
  git,
  worktreeName,
  isWorktreeExist,
}: {
  git: Task["git"];
  worktreeName?: string;
  className?: string;
  isWorktreeExist?: boolean;
}) {
  const { t } = useTranslation();
  if (!git?.origin) return null;

  return (
    <Badge
      variant="outline"
      className={cn("border-none p-0 text-foreground", className)}
    >
      {git.branch &&
        !isBranchNameSameAsWorktreeName(git.branch, worktreeName) && (
          <>
            <GitBranch className="shrink-0" />
            <span className="truncate">{git.branch}</span>
          </>
        )}
      {worktreeName && (
        <>
          <ListTreeIcon className="ml-1 shrink-0" />
          <span className="truncate">{worktreeName}</span>
          {isWorktreeExist === false && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 inline-flex">
                  <MdOutlineErrorOutline className="size-4 text-yellow-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                <span>{t("tasksPage.worktreeNotExist")}</span>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </Badge>
  );
}

function isBranchNameSameAsWorktreeName(
  branch: string | undefined,
  worktreeName: string | undefined,
): boolean {
  if (!branch || !worktreeName) return false;
  // https://github.com/microsoft/vscode/blob/9092ce3427fdd0f677333394fb10156616090fb5/extensions/git/src/commands.ts#L3512
  return branch.replace(/\//g, "-") === worktreeName;
}
