import {
  useBackgroundTaskQueued,
  useBackgroundTaskStatus,
} from "../hooks/use-background-job-list";
/**
 * Dev-mode background tasks, rendered as one group of the manage panel. Being
 * developer-only, the strings here are not translated.
 */

import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBackgroundTaskState } from "@/lib/hooks/use-background-task-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import {
  BackgroundJobManager,
  type Message,
  type Task,
  catalog,
} from "@getpochi/livekit";
import { ArrowLeftIcon, SendHorizontalIcon, ZapIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatTokens } from "../lib/format-tokens";
import { RowStatusIndicator, type RowStatusTone } from "./row-status-indicator";

export function isBackgroundTaskRunning(status: Task["status"]): boolean {
  return status === "pending-model" || status === "pending-tool";
}

function BackgroundTaskStatusIndicator({ status }: { status: Task["status"] }) {
  return (
    <RowStatusIndicator
      isRunning={isBackgroundTaskRunning(status)}
      tone={statusTone(status)}
    />
  );
}

function statusTone(status: Task["status"]): RowStatusTone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "pending-input") return "warning";
  return "muted";
}

export function BackgroundTaskDetail({
  backgroundJobId,
  showDiagnostics = !backgroundJobId,
  taskId,
  isOpen = true,
  onBack,
}: {
  taskId: string;
  backgroundJobId?: string;
  showDiagnostics?: boolean;
  isOpen?: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const jobStatus = useBackgroundTaskStatus(taskId);
  const queued = useBackgroundTaskQueued(taskId);
  const messageRows = store.useQuery(catalog.queries.makeMessagesQuery(taskId));
  const { backgroundTaskState } = useBackgroundTaskState(taskId);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [prevTaskId, setPrevTaskId] = useState(taskId);
  if (prevTaskId !== taskId) {
    setPrevTaskId(taskId);
    setDraft("");
    setSendError(null);
  }

  const ownerTaskId = task?.parentId ?? backgroundTaskState?.parentTaskId;
  const canSendMessage = Boolean(backgroundJobId && ownerTaskId);
  const isRunning = jobStatus
    ? jobStatus === "running" && !queued
    : task
      ? isBackgroundTaskRunning(task.status)
      : false;

  const handleSend = async (interrupt = false) => {
    const trimmed = draft.trim();
    if (!trimmed || !backgroundJobId || !ownerTaskId || isSending) return;
    setIsSending(true);
    setSendError(null);
    try {
      await BackgroundJobManager.forStore(store)
        .forTask(ownerTaskId)
        .sendMessage(backgroundJobId, { message: trimmed, interrupt });
      setDraft("");
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  const source = useMemo<TaskThreadSource>(
    () => ({
      messages: messageRows.map((row) => row.data as Message),
      todos: task?.todos ? [...task.todos] : [],
      isLoading: jobStatus
        ? jobStatus === "running" && !queued
        : task?.status === "pending-model" || task?.status === "pending-tool",
    }),
    [messageRows, task?.todos, task?.status, jobStatus, queued],
  );
  const latestAssistantMessage = source.messages.findLast(
    (message) =>
      message.role === "assistant" && message.metadata?.kind === "assistant",
  );
  const latestAssistantMetadata =
    latestAssistantMessage?.metadata?.kind === "assistant"
      ? latestAssistantMessage.metadata
      : undefined;

  useEffect(() => {
    // Focusing while the detail is still transformed off screen would have the
    // browser scroll its container sideways, dragging the panel with it.
    if (isOpen) backButtonRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-2">
        <Button
          ref={backButtonRef}
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Back to the background job list"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {task &&
            (jobStatus ? (
              <RowStatusIndicator
                isRunning={jobStatus === "running" && !queued}
                tone={
                  jobStatus === "failed"
                    ? "danger"
                    : jobStatus === "completed"
                      ? "success"
                      : "muted"
                }
              />
            ) : backgroundJobId && task.error?.kind === "AbortError" ? (
              <RowStatusIndicator isRunning={false} tone="muted" />
            ) : (
              <BackgroundTaskStatusIndicator status={task.status} />
            ))}
          <span className="truncate font-medium text-sm">
            {task?.title || "(Untitled)"}
          </span>
        </div>
      </div>
      {showDiagnostics && (
        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 border-b px-3 py-2 text-xs">
          <DetailRow label="Status" value={task?.status} />
          <DetailRow
            label="Updated"
            value={task ? formatRelative(task.updatedAt) : undefined}
          />
          <DetailRow
            label="Cache Input Tokens"
            value={formatDetailedTokens(
              latestAssistantMetadata?.cacheReadTokens,
            )}
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
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <TaskThread
          source={source}
          showUserMessages
          className="min-h-0 flex-1"
          messageListClassName="mb-0 min-h-0 overflow-hidden px-0 py-0"
          scrollAreaClassName="m-0 h-full max-h-none rounded-none border-0"
          instantAutoScroll
        />
      </div>
      {canSendMessage && (
        <form
          className="shrink-0 border-t p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend(false);
          }}
        >
          <div className="flex items-end gap-1.5">
            <Textarea
              data-testid="background-task-message-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void handleSend(false);
                }
              }}
              placeholder={
                isRunning
                  ? t("backgroundTasks.sendMessageRunningPlaceholder")
                  : t("backgroundTasks.sendMessagePlaceholder")
              }
              disabled={isSending}
              rows={1}
              className="max-h-[120px] min-h-[36px] flex-1 resize-none py-1.5 text-sm"
            />
            {isRunning && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t("backgroundTasks.steerMessage")}
                title={t("backgroundTasks.steerMessageHint")}
                disabled={!draft.trim() || isSending}
                onClick={() => void handleSend(true)}
              >
                <ZapIcon className="size-4" />
              </Button>
            )}
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label={t("backgroundTasks.sendMessage")}
              title={t("backgroundTasks.sendMessage")}
              disabled={!draft.trim() || isSending}
            >
              <SendHorizontalIcon className="size-4" />
            </Button>
          </div>
          {sendError && (
            <p className="mt-1 text-destructive text-xs" role="alert">
              {sendError}
            </p>
          )}
        </form>
      )}
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
