/**
 * BackgroundTaskDebugPanel — dev-mode-only floating debug UI for background tasks.
 *
 * Renders a thin vertical handle on the right edge of the chat page. Hovering
 * the handle opens an overview list of all background tasks (any status).
 * Clicking a task opens a slide-out panel that shows the task's messages and
 * todos via the reusable <TaskThread> component.
 *
 * Mounted from `features/chat/page.tsx` (only renders when `isDevMode` is true).
 *
 * This is a developer-only surface, so the user-facing strings here are not
 * translated.
 */
/* eslint-disable i18next/no-literal-string */

import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useIsDevMode } from "@/features/settings";
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
import { useMemo, useState } from "react";

export function BackgroundTaskDebugPanel() {
  const [isDevMode] = useIsDevMode();

  if (isDevMode !== true) return null;

  return <BackgroundTaskDebugPanelInner />;
}

function BackgroundTaskDebugPanelInner() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    // Auto-hide the overview list as soon as a task is selected — the
    // slide-out detail panel becomes the focus.
    setIsListOpen(false);
  };

  return (
    <>
      <HoverCard
        open={isListOpen}
        onOpenChange={setIsListOpen}
        openDelay={0}
        closeDelay={150}
      >
        <HoverCardTrigger asChild>
          {/*
            The visible gray bar stays small (`w-1.5 h-16`) so the UI is
            unobtrusive, but the hit area is a much larger transparent
            column (`w-5 h-40`) anchored to the right edge — hovering
            anywhere within that column instantly opens the list.
          */}
          <button
            type="button"
            aria-label="Background tasks debug handle"
            data-testid="background-task-debug-handle"
            className={cn(
              "-translate-y-1/2 group fixed top-1/2 right-0 z-40 flex h-40 w-5",
              "cursor-pointer items-center justify-end bg-transparent",
            )}
          >
            <span
              className={cn(
                "h-16 w-1.5 rounded-l-full bg-muted-foreground/30",
                "transition-all duration-150",
                "group-hover:h-20 group-hover:w-2 group-hover:bg-muted-foreground/60",
                isListOpen && "h-20 w-2 bg-muted-foreground/60",
              )}
            />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          side="left"
          align="center"
          sideOffset={6}
          className="max-h-[60vh] w-80 overflow-y-auto p-0"
        >
          <BackgroundTaskList
            selectedTaskId={selectedTaskId}
            onSelect={handleSelectTask}
          />
        </HoverCardContent>
      </HoverCard>
      {selectedTaskId && (
        <BackgroundTaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}

function BackgroundTaskList({
  selectedTaskId,
  onSelect,
}: {
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}) {
  const store = useDefaultStore();
  const backgroundTasks = store.useQuery(catalog.queries.backgroundTasks$);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Background Tasks
        </span>
        <span className="text-muted-foreground text-xs">
          {backgroundTasks.length}
        </span>
      </div>
      {backgroundTasks.length === 0 ? (
        <div className="px-3 py-6 text-center text-muted-foreground text-xs">
          No background tasks
        </div>
      ) : (
        <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto">
          {backgroundTasks.map((task) => (
            <BackgroundTaskListItem
              key={task.id}
              task={task}
              isSelected={task.id === selectedTaskId}
              onSelect={() => onSelect(task.id)}
            />
          ))}
        </ul>
      )}
    </div>
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
          "flex w-full flex-col items-start gap-1 px-3 py-2 text-left",
          "transition-colors hover:bg-muted/60",
          isSelected && "bg-muted",
        )}
      >
        <div className="flex w-full items-center gap-2">
          <BackgroundTaskStatusIcon task={task} />
          <span className="flex-1 truncate text-sm">
            {task.title || "(Untitled)"}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatRelative(task.updatedAt)}
          </span>
        </div>
        <div className="flex w-full items-center gap-2 pl-6 text-muted-foreground text-xs">
          <span>{task.status}</span>
          <span className="truncate font-mono text-[10px] opacity-70">
            {task.id.slice(0, 8)}
          </span>
        </div>
      </button>
    </li>
  );
}

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

function BackgroundTaskDetail({
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

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[90vw] flex-col",
        "border-l bg-background shadow-xl",
        "slide-in-from-right animate-in duration-150",
      )}
      data-testid="background-task-debug-detail"
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
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <TaskThread
          source={source}
          scrollAreaClassName="max-h-none h-[calc(100vh-180px)]"
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
