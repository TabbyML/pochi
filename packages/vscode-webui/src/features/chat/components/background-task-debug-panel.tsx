/**
 * Dev-mode-only debug UI for background tasks, rendered as one category of
 * the manage panel (see `manage-panel.tsx`).
 *
 * <BackgroundTaskList> is an overview of all background tasks (any status);
 * selecting one opens <BackgroundTaskDetail>, a slide-out panel showing that
 * task's messages and todos via the reusable <TaskThread> component.
 *
 * This is a developer-only surface, so the strings here are not translated.
 */
/* eslint-disable i18next/no-literal-string */

import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { type Message, type Task, catalog } from "@getpochi/livekit";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PauseCircle,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { formatTokens } from "../lib/format-tokens";
import { PanelSection, useCappedList } from "./panel-section";
import { StatusDot, StatusSpinner } from "./status-dot";

export const BackgroundTaskDetailTestId = "background-task-debug-detail";

export function BackgroundTaskList({
  selectedTaskId,
  onSelect,
}: {
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}) {
  const store = useDefaultStore();
  const backgroundTasks = store.useQuery(catalog.queries.backgroundTasks$);
  // Tasks pile up faster than anything else in the panel, so this category is
  // capped like the others instead of running off the bottom.
  const { visibleItems, seeMoreButton } = useCappedList(backgroundTasks);

  return (
    <PanelSection label="Tasks" count={backgroundTasks.length}>
      {backgroundTasks.length === 0 ? (
        <div className="px-2 py-1 text-muted-foreground text-xs">
          No background tasks
        </div>
      ) : (
        // No scroll container of its own: the panel's ScrollArea scrolls it.
        <ul className="flex flex-col gap-0.5">
          {visibleItems.map((task) => (
            <BackgroundTaskListItem
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              onSelect={() => onSelect(task.id)}
            />
          ))}
        </ul>
      )}
      {seeMoreButton}
    </PanelSection>
  );
}

function BackgroundTaskListItem({
  task,
  isSelected,
  onSelect,
}: {
  task: Task;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left",
          "transition-colors hover:bg-muted/60",
          isSelected && "bg-muted",
        )}
      >
        {/* The status dot carries the status; the id lives in the detail view. */}
        <BackgroundTaskStatusDot task={task} />
        <span className="min-w-0 flex-1 truncate text-sm">
          {task.title || "(Untitled)"}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatRelative(task.updatedAt)}
        </span>
      </button>
    </li>
  );
}

/** In a dense list, dots keep every row on the same visual rhythm. */
function BackgroundTaskStatusDot({ task }: { task: Task }) {
  switch (task.status) {
    case "pending-model":
    case "pending-tool":
      return <StatusSpinner />;
    case "pending-input":
      return <StatusDot className="bg-amber-500" />;
    case "completed":
      return <StatusDot className="bg-green-500 dark:bg-green-700" />;
    case "failed":
      return <StatusDot className="bg-destructive" />;
    default:
      return <StatusDot className="bg-muted-foreground/50" />;
  }
}

/**
 * The detail header shows a single task, so it can afford a shaped icon: it is
 * far more legible than a dot when nothing else is around to compare it to.
 */
function BackgroundTaskStatusIcon({ task }: { task: Task }) {
  switch (task.status) {
    case "pending-model":
    case "pending-tool":
      return (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
      );
    case "pending-input":
      return <PauseCircle className="size-3.5 shrink-0 text-amber-500" />;
    case "completed":
      return <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />;
    case "failed":
      return <AlertCircle className="size-3.5 shrink-0 text-destructive" />;
    default:
      return <span className="size-3.5 shrink-0" />;
  }
}

export function BackgroundTaskDetail({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
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

  // Portaled to <body>: the manage panel sits in a `z-20` stacking context, so
  // an in-place `z-[60]` would still be trapped below the popover's portal.
  return createPortal(
    <div
      className={cn(
        // Above the popover (z-50) it is opened from, which stays open behind it.
        "fixed inset-y-0 right-0 z-[60] flex w-[420px] max-w-[90vw] flex-col",
        "border-l bg-background shadow-xl",
        "slide-in-from-right animate-in duration-150",
      )}
      data-testid={BackgroundTaskDetailTestId}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {task && <BackgroundTaskStatusIcon task={task} />}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">
              {task?.title || "(Untitled)"}
            </span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {taskId}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Close background task detail"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
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
    </div>,
    document.body,
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
