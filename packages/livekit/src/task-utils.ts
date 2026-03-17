import { defaultCatalog as catalog } from "./livestore";
import type { LiveKitStore, Message } from "./types";

export type TaskStatusLike =
  | "completed"
  | "pending-input"
  | "failed"
  | "pending-tool"
  | "pending-model";

export type BackgroundJobStatus = "idle" | "running" | "completed";

export type FollowupQuestion = {
  question: string;
  header?: string;
  choices?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatFollowupQuestion({
  question,
  header,
  choices,
}: FollowupQuestion) {
  const title = header ? `[${header}] ${question}` : question;
  if (!choices?.length) return title;

  return `${title}\n${choices.map((choice) => `- ${choice}`).join("\n")}`;
}

function normalizeQuestion(value: unknown): FollowupQuestion | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const question = asNonEmptyString(record.question);
  if (!question) return undefined;

  const options = Array.isArray(record.options) ? record.options : [];
  const choices = options
    .map((option) => asNonEmptyString(asRecord(option)?.label))
    .filter((choice): choice is string => choice !== undefined);

  return {
    question,
    header: asNonEmptyString(record.header),
    choices: choices.length > 0 ? choices : undefined,
  };
}

export function extractFollowupQuestions(input: unknown): FollowupQuestion[] {
  const record = asRecord(input);
  const questions = Array.isArray(record?.questions) ? record.questions : [];

  return questions
    .map((question) => normalizeQuestion(question))
    .filter((question): question is FollowupQuestion => question !== undefined);
}

export function formatFollowupQuestions(input: unknown): string | undefined {
  const questions = extractFollowupQuestions(input);
  if (questions.length === 0) return undefined;

  return questions
    .map((question) => formatFollowupQuestion(question))
    .join("\n\n");
}

export function extractWebhookFollowups(
  input: unknown,
): FollowupQuestion[] | undefined {
  const questions = extractFollowupQuestions(input);
  return questions.length > 0 ? questions : undefined;
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
export function extractTaskResult(store: LiveKitStore, uid: string) {
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

    if (
      part.type === "tool-askFollowupQuestion" &&
      (part.state === "input-available" || part.state === "output-available")
    ) {
      return formatFollowupQuestions(part.input);
    }
  }
}
