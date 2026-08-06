import type { SubAgentResultNotification } from "@getpochi/common";
import type { AskFollowupQuestionInput, Question } from "@getpochi/tools";
import type { z } from "zod";
import { defaultCatalog as catalog } from "./livestore";
import type { LiveKitStore, Message, Task } from "./types";

export type TaskStatusLike =
  | "completed"
  | "pending-input"
  | "failed"
  | "pending-tool"
  | "pending-model";

export type BackgroundJobStatus = "idle" | "running" | "completed";

function formatQuestion({ question, header, options }: Question) {
  const title = header ? `[${header}] ${question}` : question;
  if (!options?.length) return title;

  return `${title}\n${options.map((o) => `- ${o.label}`).join("\n")}`;
}

export function formatFollowupQuestions(
  input: AskFollowupQuestionInput,
): string {
  if (input.questions.length === 0) return "";

  return input.questions.map((q) => formatQuestion(q)).join("\n\n");
}

/**
 * Map a task status to the background-job-style status used by tools/UI.
 */
export function mapTaskStatusToBackgroundStatus(
  status: TaskStatusLike,
): BackgroundJobStatus {
  switch (status) {
    case "pending-input":
      return "idle";
    case "pending-tool":
    case "pending-model":
      return "running";
    case "completed":
    case "failed":
      return "completed";
  }
}

/**
 * Best-effort extraction of an error message from an unknown error payload.
 */
export function getTaskErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { message?: unknown };
  return typeof record.message === "string" ? record.message : undefined;
}

/**
 * Extract the last step's attemptCompletion / askFollowupQuestion result.
 * Throws when no messages exist for the task.
 */
export function extractTaskResult(store: LiveKitStore, uid: string): unknown {
  const result = extractRawAttemptCompletionResult(store, uid);
  if (result !== undefined) {
    return result;
  }

  const lastMessage = store
    .query(catalog.queries.makeMessagesQuery(uid))
    .map((x) => x.data as Message)
    .at(-1);
  if (!lastMessage) {
    throw new Error(`No message found for uid ${uid}`);
  }

  const lastStepStart = lastMessage.parts.findLastIndex(
    (x) => x.type === "step-start",
  );

  for (const part of lastMessage.parts.slice(lastStepStart + 1)) {
    if (
      part.type === "tool-askFollowupQuestion" &&
      (part.state === "input-available" || part.state === "output-available")
    ) {
      return formatFollowupQuestions(part.input);
    }
  }
}

/**
 * Builds the notification for a finished background subagent task, injected
 * into the parent conversation as a `data-subagent-results` part.
 */
export function createSubAgentResultNotification(
  store: LiveKitStore,
  task: Pick<Task, "id" | "status" | "error" | "title">,
  agentType?: string,
): SubAgentResultNotification {
  const title = task.title ?? undefined;
  if (task.status === "failed") {
    return {
      taskId: task.id,
      agentType,
      title,
      status: "failed",
      result: getTaskErrorMessage(task.error) ?? "Subagent failed.",
    };
  }

  let result: unknown;
  try {
    result = extractTaskResult(store, task.id);
  } catch {
    result = undefined;
  }
  return {
    taskId: task.id,
    agentType,
    title,
    status: "completed",
    result:
      result === undefined
        ? "Subagent finished without an explicit result."
        : typeof result === "string"
          ? result
          : JSON.stringify(result),
  };
}

/**
 * Flips a failed background task back to pending-model by re-committing its
 * last message, so the TaskExecutor picks it up again. Only failed tasks are
 * restarted: reviving a completed task would leave it stuck in pending-model
 * (the executor finishes without another status commit) and the reconcile
 * loop would pick it up forever.
 */
export function restartBackgroundTask(
  store: LiveKitStore,
  taskId: string,
): boolean {
  const task = store.query(catalog.queries.makeTaskQuery(taskId));
  if (!task?.background) return false;
  if (task.status === "pending-model" || task.status === "pending-tool") {
    return true;
  }
  if (task.status !== "failed") return false;
  const lastMessage = store
    .query(catalog.queries.makeMessagesQuery(taskId))
    .map((x) => x.data as Message)
    .at(-1);
  if (!lastMessage) return false;
  store.commit(
    catalog.events.chatStreamStarted({
      id: taskId,
      data: lastMessage,
      todos: task.todos ? [...task.todos] : [],
      updatedAt: new Date(),
      modelId: task.modelId ?? undefined,
    }),
  );
  return true;
}

export function extractAttemptCompletionResult<T>(
  store: LiveKitStore,
  uid: string,
  schema: z.ZodType<T>,
): T | undefined {
  const result = extractRawAttemptCompletionResult(store, uid);
  if (result === undefined) return undefined;

  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    throw new Error(
      `Invalid attemptCompletion result: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

function extractRawAttemptCompletionResult(
  store: LiveKitStore,
  uid: string,
): unknown {
  const lastMessage = store
    .query(catalog.queries.makeMessagesQuery(uid))
    .map((x) => x.data as Message)
    .at(-1);
  if (!lastMessage) {
    throw new Error(`No message found for uid ${uid}`);
  }

  const lastStepStart = lastMessage.parts.findLastIndex(
    (x) => x.type === "step-start",
  );

  for (const part of lastMessage.parts.slice(lastStepStart + 1)) {
    if (
      part.type === "tool-attemptCompletion" &&
      (part.state === "input-available" || part.state === "output-available")
    ) {
      return part.input.result;
    }
  }
}
