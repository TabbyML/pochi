/**
 * Background agents UI — view and manage background subagent tasks
 * (newTask with runInBackground) and, optionally, system background tasks
 * such as memory extraction.
 *
 * Composition:
 * - <BackgroundTasksChip/> — toolbar entry; shows a spinner with the running
 *   count while agents are active. Opens the list popover.
 * - List — status, agent badge, title, relative time, stop/retry actions.
 *   Shows subagent tasks; system background tasks (memory extraction etc.)
 *   appear only in dev mode.
 * - Detail — slide-out panel rendering the task thread reactively from the
 *   store (works for TaskExecutor-driven tasks, updating at step boundaries).
 */

import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsDevMode } from "@/features/settings";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import type { BackgroundTaskState } from "@getpochi/common";
import { type Message, type Task, catalog } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Loader2,
  PauseCircle,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface BackgroundTasksActions {
  stopBackgroundTask?: (taskId: string) => Promise<void>;
}

export function BackgroundTasksChip({
  className,
  stopBackgroundTask,
}: BackgroundTasksActions & { className?: string }) {
  const { t } = useTranslation();
  const [isDevMode] = useIsDevMode();
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);

  const { tasks, totalCount, states } = useVisibleBackgroundTasks(
    isDevMode === true && showSystem,
  );
  const runningCount = tasks.filter(isRunningTask).length;

  // In dev mode the chip stays reachable while any background task exists,
  // so the system toggle is accessible even without subagents.
  if (tasks.length === 0 && !(isDevMode === true && totalCount > 0)) {
    return null;
  }

  return (
    <>
      <Popover open={isListOpen} onOpenChange={setIsListOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 shrink-0 gap-1 rounded-full border bg-background/80 px-2 text-muted-foreground text-xs shadow-sm backdrop-blur",
              className,
            )}
            aria-label={t("backgroundTasks.title")}
          >
            {runningCount > 0 ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <Bot className="size-3.5" />
            )}
            <span>{runningCount > 0 ? runningCount : tasks.length}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-80 p-0">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {t("backgroundTasks.title")}
            </span>
            <div className="flex items-center gap-2">
              {isDevMode === true && (
                <Button
                  variant={showSystem ? "secondary" : "ghost"}
                  size="sm"
                  className="h-5 px-1.5 text-[10px]"
                  title={t("backgroundTasks.showAll")}
                  onClick={() => setShowSystem((v) => !v)}
                >
                  {t("backgroundTasks.all")}
                </Button>
              )}
              <span className="text-muted-foreground text-xs">
                {tasks.length}
              </span>
            </div>
          </div>
          {tasks.length === 0 ? (
            <div className="px-3 py-6 text-center text-muted-foreground text-xs">
              {t("backgroundTasks.empty")}
            </div>
          ) : (
            <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto">
              {tasks.map((task) => (
                <BackgroundTaskRow
                  key={task.id}
                  task={task}
                  agentType={states[task.id]?.agentType}
                  useCase={states[task.id]?.useCase}
                  stopBackgroundTask={stopBackgroundTask}
                  onSelect={() => {
                    setSelectedTaskId(task.id);
                    setIsListOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      {selectedTaskId && (
        <BackgroundTaskDetail
          taskId={selectedTaskId}
          agentType={states[selectedTaskId]?.agentType}
          useCase={states[selectedTaskId]?.useCase}
          stopBackgroundTask={stopBackgroundTask}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  );
}

function BackgroundTaskRow({
  task,
  agentType,
  useCase,
  stopBackgroundTask,
  onSelect,
}: {
  task: Task;
  agentType: string | undefined;
  useCase: string | undefined;
  onSelect: () => void;
} & BackgroundTasksActions) {
  const { t } = useTranslation();
  const badge = agentType ?? (useCase !== "subagent" ? useCase : undefined);

  return (
    <li className="group">
      <div
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2",
          "transition-colors hover:bg-muted/60",
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
        >
          <div className="flex w-full items-center gap-2">
            <BackgroundTaskStatusIcon task={task} />
            <span className="flex-1 truncate text-sm">
              {task.title || t("backgroundTasks.untitled")}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatRelative(task.updatedAt)}
            </span>
          </div>
          {badge && (
            <span className="pl-6 text-[10px] text-muted-foreground">
              {badge}
            </span>
          )}
        </button>
        <BackgroundTaskActions
          task={task}
          stopBackgroundTask={stopBackgroundTask}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </li>
  );
}

function BackgroundTaskActions({
  task,
  stopBackgroundTask,
  className,
}: {
  task: Task;
  className?: string;
} & BackgroundTasksActions) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (isRunningTask(task) && stopBackgroundTask) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6 shrink-0", className)}
        title={t("backgroundTasks.stop")}
        disabled={busy}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          try {
            await stopBackgroundTask(task.id);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Square className="size-3.5" />
        )}
      </Button>
    );
  }

  return null;
}

function BackgroundTaskDetail({
  taskId,
  agentType,
  useCase,
  stopBackgroundTask,
  onClose,
}: {
  taskId: string;
  agentType: string | undefined;
  useCase: string | undefined;
  onClose: () => void;
} & BackgroundTasksActions) {
  const { t } = useTranslation();
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const messageRows = store.useQuery(catalog.queries.makeMessagesQuery(taskId));

  const source = useMemo<TaskThreadSource>(
    () => ({
      messages: messageRows.map((row) => row.data as Message),
      todos: task?.todos ? [...task.todos] : [],
      isLoading:
        task?.status === "pending-model" || task?.status === "pending-tool",
    }),
    [messageRows, task?.todos, task?.status],
  );

  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[90vw] flex-col",
        "border-l bg-background shadow-xl",
        "slide-in-from-right animate-in duration-150",
      )}
      data-testid="background-task-detail"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {task && <BackgroundTaskStatusIcon task={task} />}
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm">
              {task?.title || t("backgroundTasks.untitled")}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              {agentType ?? useCase ?? ""}
              {task?.error?.message ? ` · ${task.error.message}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {task && (
            <BackgroundTaskActions
              task={task}
              stopBackgroundTask={stopBackgroundTask}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <TaskThread
          source={source}
          className="min-h-0 flex-1"
          messageListClassName="mb-0 min-h-0 overflow-hidden px-0 py-0"
          scrollAreaClassName="m-0 h-full max-h-none rounded-none border-0"
          instantAutoScroll
          showUserMessages
        />
      </div>
    </div>
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

function isRunningTask(task: Task) {
  return task.status === "pending-model" || task.status === "pending-tool";
}

/**
 * Background tasks joined with their BackgroundTaskState (agentType/useCase)
 * from the extension host. Only subagent tasks are visible unless `showAll`
 * reveals system background tasks (memory extraction etc.). Tasks whose
 * state is still loading are hidden so system agents never flash into the
 * list.
 */
function useVisibleBackgroundTasks(showAll: boolean) {
  const store = useDefaultStore();
  const all = store.useQuery(catalog.queries.backgroundTasks$);
  const [states, setStates] = useState<
    Record<string, BackgroundTaskState | undefined>
  >({});
  const fetchingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isVSCodeEnvironment()) return;
    for (const task of all) {
      if (fetchingRef.current.has(task.id)) continue;
      fetchingRef.current.add(task.id);
      vscodeHost
        .readBackgroundTaskState(task.id)
        .then((result) => {
          const value = threadSignal(result.value).value;
          setStates((prev) => ({ ...prev, [task.id]: value }));
        })
        .catch(() => {
          // State unavailable; the task stays out of the subagent list.
        });
    }
  }, [all]);

  const tasks = useMemo(
    () =>
      all.filter((task) => showAll || states[task.id]?.useCase === "subagent"),
    [all, showAll, states],
  );

  return { tasks, totalCount: all.length, states };
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
