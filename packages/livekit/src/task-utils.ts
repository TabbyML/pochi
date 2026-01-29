import { defaultCatalog as catalog } from "./livestore";
import type { LiveKitStore, Message } from "./types";

export type TaskStatusLike =
  | "completed"
  | "pending-input"
  | "failed"
  | "pending-tool"
  | "pending-model";

export type BackgroundJobStatus = "idle" | "running" | "completed";

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
      return part.input.question;
    }
  }
}
