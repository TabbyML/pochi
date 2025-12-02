import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { parseTitle } from "@getpochi/common/message-utils";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { prefixTaskDisplayId } from "@getpochi/common/task-utils";
import type { TaskState } from "@getpochi/common/vscode-webui-bridge";
import type { Task, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import { GitBranch, Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EditSummary } from "../tool-invocation/edit-summary";
import { ToolCallLite } from "./tool-call-lite";

export function TaskRow({
  task,
  state,
}: {
  task: Task;
  state?: TaskState;
}) {
  const { jwt } = usePochiCredentials();

  const title = useMemo(() => parseTitle(task.title), [task.title]);

  const content = (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border border-border/50 bg-card transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-md",
        "border-l-2",
        getStatusBorderColor(task.status),
      )}
    >
      <div className="px-2 py-1">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1 overflow-hidden">
            <div className="flex items-center gap-2">
              {task.displayId && (
                <span className="flex shrink-0 items-center justify-center rounded bg-muted px-1 font-bold font-mono text-foreground/80 text-sm">
                  {prefixTaskDisplayId(task.displayId)}
                </span>
              )}
              <h3 className="line-clamp-2 flex flex-1 items-center font-medium text-foreground leading-relaxed transition-colors duration-200 group-hover:text-foreground/80">
                <span className="truncate">{title}</span>
                {state?.unread && (
                  <div className="ml-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-sm italic">
                  {formatTimeAgo(task.createdAt)}
                </div>
              </div>
            </div>
            <div className="h-6 text-muted-foreground text-sm">
              <div className="flex items-center justify-between gap-2 overflow-hidden">
                <div className="flex flex-1 items-center gap-2 overflow-hidden">
                  <GitBadge git={task.git} />
                  {task.lineChanges && (
                    <EditSummary
                      editSummary={task.lineChanges}
                      className="mx-0 flex shrink-0 items-center text-sm"
                    />
                  )}
                </div>
                {state?.running && task.pendingToolCalls?.length ? (
                  <ToolCallLite
                    tools={task.pendingToolCalls as Array<ToolUIPart<UITools>>}
                  />
                ) : (
                  <TaskStatusView task={task} state={state} />
                )}
              </div>
            </div>
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
        displayId: task.displayId ?? undefined,
        storeId,
      });
    }
  }, [task.cwd, task.id, task.displayId, storeId]);

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
  git,
}: {
  git: Task["git"];
}) {
  if (!git?.origin || !git?.branch) return null;

  return (
    <div className="flex min-w-0 items-center gap-1 text-muted-foreground/80 text-sm">
      <GitBranch className="size-3 shrink-0" />
      <span className="truncate">{git.branch}</span>
    </div>
  );
}

function TaskStatusView({
  task,
  state,
}: {
  task: Task;
  state?: TaskState;
}) {
  const { t } = useTranslation();
  switch (task.status) {
    case "pending-input":
    case "pending-model":
    case "pending-tool": {
      return (
        <span className="flex items-center gap-2 overflow-x-hidden whitespace-nowrap">
          {state?.running && (
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
          )}
          <span className="truncate">
            {state?.running
              ? t("tasksPage.taskStatus.planning")
              : t("tasksPage.taskStatus.paused")}
          </span>
        </span>
      );
    }
    case "failed":
      return (
        <span className="flex flex-nowrap items-center gap-1 overflow-x-hidden truncate whitespace-nowrap">
          {task.error?.message ? (
            <>
              <span>{t("tasksPage.taskStatus.errorPrefix")}</span>
              <span className="truncate">{task.error?.message}</span>
            </>
          ) : (
            <span>{t("tasksPage.taskStatus.fallbackError")}</span>
          )}
        </span>
      );
    default: {
      const duration = formatDuration(task);
      return (
        <span className="overflow-x-hidden truncate whitespace-nowrap">
          {t("tasksPage.taskStatus.finished", { duration })}
        </span>
      );
    }
  }
}

function formatDuration(task: Task): string {
  const { lastStepDuration, createdAt, updatedAt } = task;
  const durationMs =
    lastStepDuration && lastStepDuration.value._tag === "Millis"
      ? lastStepDuration.value.millis
      : undefined;

  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  const diffMs = durationMs ?? updated - created;

  const diffSeconds = (diffMs / 1000).toFixed(1);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (Number.parseFloat(diffSeconds) < 60) {
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

function formatTimeAgo(createdAt: Date | string | number): string {
  const now = Date.now();
  const updated = new Date(createdAt).getTime();
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
