/**
 * Dev-mode background tasks, rendered as one group of the manage panel.
 *
 * `useBackgroundTasks` + `BackgroundTaskRow` make up the list; picking a row
 * takes the drawer to `BackgroundTaskDetail`, which shows that task's messages
 * and todos through the reusable <TaskThread>.
 *
 * Nothing here is mounted unless dev mode is on, so the background tasks query
 * never runs for anybody else.
 *
 * This is a developer-only surface, so the strings here are not translated.
 */

import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { type Message, type Task, catalog } from "@getpochi/livekit";
import { ArrowLeftIcon, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { formatTokens } from "../lib/format-tokens";

/** The panel's own section titles are translated; this one is dev-only. */
export const BackgroundTasksLabel = "Background tasks";

export function useBackgroundTasks(): readonly Task[] {
  const store = useDefaultStore();
  return store.useQuery(catalog.queries.backgroundTasks$);
}

export function BackgroundTaskRow({
  task,
  onSelect,
}: {
  task: Task;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      )}
    >
      <BackgroundTaskStatusIndicator status={task.status} />
      <span className="min-w-0 flex-1 truncate text-sm">
        {task.title || "(Untitled)"}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatRelative(task.updatedAt)}
      </span>
    </button>
  );
}

/**
 * The same status language the command rows speak — spinner for work in
 * progress, a dot for every resting state — over the task vocabulary.
 */
function BackgroundTaskStatusIndicator({ status }: { status: Task["status"] }) {
  const isRunning = status === "pending-model" || status === "pending-tool";

  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
      {isRunning ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : (
        <span
          className={cn("size-1.5 rounded-full bg-muted-foreground/50", {
            "bg-amber-500": status === "pending-input",
            "bg-green-500 dark:bg-green-700": status === "completed",
            "bg-destructive": status === "failed",
          })}
        />
      )}
    </span>
  );
}

export function BackgroundTaskDetail({
  taskId,
  onBack,
}: {
  taskId: string;
  onBack: () => void;
}) {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const messageRows = store.useQuery(catalog.queries.makeMessagesQuery(taskId));
  const { backgroundTaskState } = useBackgroundTaskState(taskId);

  const source = useMemo<TaskThreadSource>(
    () => ({
      messages: messageRows.map((row) => row.data as Message),
      todos: task?.todos ? [...task.todos] : [],
      isLoading:
        task?.status === "pending-model" || task?.status === "pending-tool",
    }),
    [messageRows, task?.todos, task?.status],
  );
  const latestAssistantMessage = source.messages.findLast(
    (message) =>
      message.role === "assistant" && message.metadata?.kind === "assistant",
  );
  const latestAssistantMetadata =
    latestAssistantMessage?.metadata?.kind === "assistant"
      ? latestAssistantMessage.metadata
      : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-2">
        {/* The way back to the list, in the drawer's own header column. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Back to the background job list"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {task && <BackgroundTaskStatusIndicator status={task.status} />}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">
              {task?.title || "(Untitled)"}
            </span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {taskId}
            </span>
          </div>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 border-b px-3 py-2 text-xs">
        <DetailRow label="Status" value={task?.status} />
        <DetailRow
          label="Updated"
          value={task ? formatRelative(task.updatedAt) : undefined}
        />
        <DetailRow
          label="Cache Input Tokens"
          value={formatDetailedTokens(latestAssistantMetadata?.cacheReadTokens)}
        />
        <DetailRow
          label="Input Tokens"
          value={formatDetailedTokens(latestAssistantMetadata?.inputTokens)}
        />
        {backgroundTaskState?.useCase && (
          <DetailRow label="Use case" value={backgroundTaskState.useCase} />
        )}
        {backgroundTaskState?.parentTaskId && (
          <DetailRow
            label="Parent"
            value={backgroundTaskState.parentTaskId.slice(0, 8)}
            mono
          />
        )}
        {backgroundTaskState?.tools?.length !== undefined && (
          <DetailRow
            label="Tools"
            value={`${backgroundTaskState.tools.length}`}
          />
        )}
        {task?.error?.message && (
          <DetailRow label="Error" value={task.error.message} fullWidth />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <TaskThread
          source={source}
          className="min-h-0 flex-1"
          messageListClassName="mb-0 min-h-0 overflow-hidden px-0 py-0"
          scrollAreaClassName="m-0 h-full max-h-none rounded-none border-0"
          instantAutoScroll
        />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  fullWidth,
}: {
  label: string;
  value: string | undefined;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={cn("flex flex-col gap-0.5", fullWidth && "col-span-2")}>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span
        className={cn("truncate text-foreground", mono && "font-mono text-xs")}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function formatDetailedTokens(tokens: number | undefined): string {
  return tokens === undefined ? "-" : formatTokens(tokens);
}

function formatRelative(date: Date | string | number): string {
  const updated = new Date(date).getTime();
  const diffMs = Date.now() - updated;
  if (diffMs < 0) return "now";

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 5) return "now";
  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}
