import {
  type AutoMemoryManager,
  getLogger,
  serializeTaskTranscript,
} from "@getpochi/common";
import { makeTaskQuery } from "../livestore/default-queries";
import type { LiveKitStore, Message } from "../types";

const logger = getLogger("TaskTranscript");

/**
 * Statuses that end a turn. `pending-tool` / `pending-model` are intermediate
 * steps of the same turn; rewriting the whole transcript on each of them would
 * only churn the file.
 */
const TurnEndStatuses = new Set(["completed", "pending-input", "failed"]);

/**
 * Persists the task transcript at every turn end. The transcript is the
 * task's own record, consumed by long-term memory and task references alike,
 * so it is written independently of whether memory extraction runs.
 */
export class TaskTranscriptWriter {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: {
      taskId: string;
      store: LiveKitStore;
      manager: Pick<AutoMemoryManager, "writeTaskTranscript">;
    },
  ) {}

  write({
    messages,
    status,
  }: {
    messages: readonly Message[];
    status: string;
  }): Promise<void> {
    if (!TurnEndStatuses.has(status)) return Promise.resolve();
    // Serialize now: the caller's message array keeps changing after the turn.
    const transcript = serializeTaskTranscript(messages);
    if (!transcript) return Promise.resolve();

    const { taskId, store, manager } = this.options;
    const task = store.query(makeTaskQuery(taskId));
    const request = {
      taskId,
      cwd: task?.cwd ?? undefined,
      title: task?.title ?? undefined,
      status,
      updatedAt: Date.now(),
      transcript,
    };
    // Writes replace the whole file, so keep them ordered: a slow earlier
    // write must not overwrite a later turn.
    const result = this.queue
      .then(() => manager.writeTaskTranscript(request))
      .then(
        () => undefined,
        (error) => {
          logger.warn("Failed to write task transcript", error);
        },
      );
    this.queue = result;
    return result;
  }
}
