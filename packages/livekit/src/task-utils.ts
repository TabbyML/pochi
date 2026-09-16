import {
  type BackgroundSubagentNotification,
  getSubAgentBackgroundJobId,
  getSubAgentNotificationId,
} from "@getpochi/common";
import {
  type AskFollowupQuestionInput,
  type Question,
  isUserInputToolPart,
} from "@getpochi/tools";
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

/** A result or a request for user input ends the current agent turn. */
export function isResultMessage(message: Message): boolean {
  return (
    message.role === "assistant" &&
    (message.parts?.some(isUserInputToolPart) ?? false)
  );
}

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
 * True while the last step ends with an unanswered follow-up question, so the
 * next turn belongs to the user.
 */
export function isAwaitingFollowupAnswer(
  message: Message | undefined,
): boolean {
  if (!message) return false;

  const lastStepStart = message.parts.findLastIndex(
    (x) => x.type === "step-start",
  );

  return message.parts
    .slice(lastStepStart + 1)
    .some(
      (part) =>
        part.type === "tool-askFollowupQuestion" &&
        part.state === "input-available",
    );
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

/** Resolves notification metadata from the original newTask call. */
export function getSubAgentInvocation(
  taskId: string,
  parentMessages: readonly Message[],
) {
  const invocation = parentMessages
    .flatMap((message) => message.parts)
    .find(
      (part) =>
        part.type === "tool-newTask" &&
        part.state !== "input-streaming" &&
        part.input?._meta?.uid === taskId,
    );
  const input =
    invocation?.type === "tool-newTask" &&
    invocation.state !== "input-streaming"
      ? invocation.input
      : undefined;
  return input;
}

/**
 * Builds the notification for a finished background subagent task, injected
 * into the parent conversation as a `data-background-job-notification` part.
 */
export function createBackgroundSubagentNotification(
  store: LiveKitStore,
  task: Pick<Task, "id" | "status" | "error" | "title">,
  parentMessages: readonly Message[],
): BackgroundSubagentNotification {
  const base = {
    kind: "subagent" as const,
    notificationId: getSubAgentNotificationId(task),
    backgroundJobId: getSubAgentBackgroundJobId(task.id),
  };
  const input = getSubAgentInvocation(task.id, parentMessages);
  const agentType = input?.agentType;
  const title = task.title || input?.description || undefined;
  if (task.status === "failed") {
    return {
      ...base,
      taskId: task.id,
      agentType,
      title,
      status: task.error?.kind === "AbortError" ? "stopped" : "failed",
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
    ...base,
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
