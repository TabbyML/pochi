import { Badge } from "@/components/ui/badge";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { parseTitle } from "@getpochi/common/message-utils";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { Task, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import { GitBranch } from "lucide-react";
import { useCallback, useMemo } from "react";
import { ToolCallLite } from "./tool-call-lite";

export function TaskRow({
  task,
  worktreeName,
  isWorktreeExist,
  isRead,
}: {
  task: Task;
  worktreeName?: string;
  isWorktreeExist?: boolean;
  isRead?: boolean;
}) {
  const { jwt } = usePochiCredentials();

  const title = useMemo(() => parseTitle(task.title), [task.title]);

  const showLineChangesBadge =
    !!task.lineChanges?.added || !!task.lineChanges?.removed;

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
            <div className="flex items-center gap-2">
              <GitBadge
                git={task.git}
                worktreeName={worktreeName}
                className="max-w-full text-muted-foreground/80 text-xs"
                isWorktreeExist={isWorktreeExist}
              />
              {showLineChangesBadge && (
                <div className="inline-flex items-center gap-1.5 rounded-sm border border-muted-foreground/50 px-1.5 py-0.5 font-medium text-xs">
                  <span className="text-green-600 dark:text-green-500">
                    +{task.lineChanges?.added || 0}
                  </span>
                  <span className="text-red-600 dark:text-red-500">
                    -{task.lineChanges?.removed || 0}
                  </span>
                </div>
              )}
            </div>
            <h3 className="line-clamp-2 flex flex-1 items-center font-medium text-foreground leading-relaxed transition-colors duration-200 group-hover:text-foreground/80">
              <span className="truncate">{title}</span>
              {isRead ? null : (
                <div className="ml-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </h3>
            <div className="h-6 text-muted-foreground text-sm">
              {task.pendingToolCalls?.length ? (
                <ToolCallLite
                  tools={task.pendingToolCalls as Array<ToolUIPart<UITools>>}
                />
              ) : (
                <TaskStatusView task={task} />
              )}
            </div>
          </div>
          <div className="mt-0.5 shrink-0 text-muted-foreground text-sm">
            {formatTimeAgo(task.updatedAt)}
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

const getStatusBorderColor = (status: string): string => {
  switch (status) {
    case "streaming":
    case "pending-model":
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

function GitBadge({
  className,
  git,
}: {
  git: Task["git"];
  worktreeName?: string;
  className?: string;
  isWorktreeExist?: boolean;
}) {
  if (!git?.origin) return null;

  return (
    <Badge
      variant="outline"
      className={cn("border-transparent p-0 text-foreground", className)}
    >
      {git.branch && (
        <>
          <GitBranch className="shrink-0" />
          <span className="truncate">{git.branch}</span>
        </>
      )}
    </Badge>
  );
}

function TaskStatusView({ task }: { task: Task }) {
  switch (task.status) {
    case "pending-input":
    case "pending-model":
    case "pending-tool": {
      return (
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>Planning next moves...</span>
        </span>
      );
    }
    case "failed":
      return "Error encountered";
    default: {
      const duration = formatDuration(task.createdAt, task.updatedAt);
      return `Finished in ${duration}`;
    }
  }
}

function formatDuration(
  createdAt: Date | string | number,
  updatedAt: Date | string | number,
): string {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  const diffMs = updated - created;

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}min`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  return `${diffDays}d`;
}

function formatTimeAgo(updatedAt: Date | string | number): string {
  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  const diffMs = now - updated;

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 5) {
    return "now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}min`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  return `${diffDays}d`;
}
