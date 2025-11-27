import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { parseTitle } from "@getpochi/common/message-utils";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { Task, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import { GitBranch, Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { useTranslation as UseTranslation } from "react-i18next";
import { EditSummary } from "../tool-invocation/edit-summary";
import { ToolCallLite } from "./tool-call-lite";

export function TaskRow({
  task,
  isRead,
}: {
  task: Task;
  isRead?: boolean;
}) {
  const { jwt } = usePochiCredentials();
  const { t } = useTranslation();

  const title = useMemo(() => parseTitle(task.title), [task.title]);

  const content = (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border border-border/50 bg-card transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-md",
        "border-l-4",
        getStatusBorderColor(task.status),
      )}
    >
      <div className="px-2 py-1">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <h3 className="line-clamp-2 flex flex-1 items-center font-medium text-foreground leading-relaxed transition-colors duration-200 group-hover:text-foreground/80">
                <span className="truncate">{title}</span>
                {isRead ? null : (
                  <div className="ml-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-muted-foreground text-sm">
                  {formatTimeAgo(task.updatedAt)}
                </div>
              </div>
            </div>
            <div className="h-6 text-muted-foreground text-sm">
              <div className="flex items-center justify-between gap-2 overflow-hidden">
                <div className="flex items-center gap-2 overflow-hidden">
                  <GitBadge git={task.git} />
                  {task.pendingToolCalls?.length ? (
                    <ToolCallLite
                      tools={
                        task.pendingToolCalls as Array<ToolUIPart<UITools>>
                      }
                    />
                  ) : (
                    <TaskStatusView task={task} t={t} />
                  )}
                </div>
                {task.lineChanges && (
                  <EditSummary
                    editSummary={task.lineChanges}
                    className="mx-0 shrink-0 text-sm"
                  />
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
  git,
}: {
  git: Task["git"];
}) {
  if (!git?.origin || !git?.branch) return null;

  return (
    <div className="inline-flex items-center gap-1 text-muted-foreground/80 text-sm">
      <GitBranch className="h-4 w-4 shrink-0" />
      <span className="truncate">{git.branch}</span>
    </div>
  );
}

function TaskStatusView({
  task,
  t,
}: {
  task: Task;
  t: ReturnType<typeof UseTranslation>["t"];
}) {
  switch (task.status) {
    case "pending-input":
    case "pending-model":
    case "pending-tool": {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>{t("tasksPage.taskStatus.planning")}</span>
        </span>
      );
    }
    case "failed":
      return t("tasksPage.taskStatus.error");
    default: {
      const duration = formatDuration(task);
      return t("tasksPage.taskStatus.finished", { duration });
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
