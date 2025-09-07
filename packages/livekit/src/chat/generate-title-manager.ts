import type { LanguageModelV2 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { makeTaskQuery } from "../livestore/queries";
import { events } from "../livestore/schema";
import type { Message } from "../types";
import { generateTaskTitle } from "./llm/generate-task-title";

const logger = getLogger("GenerateTitleManager");

interface GenerateTitleJob {
  taskId: string;
  store: Store;
  messages: Message[];
  getModel: () => LanguageModelV2;
  waitUntil?: (promise: Promise<unknown>) => void;
}

class GenerateTitleManager {
  private jobs = Promise.resolve();
  private pendingJobs = new Map<string, GenerateTitleJob>();

  push(job: GenerateTitleJob) {
    this.pendingJobs.set(job.taskId, job);

    this.jobs = this.jobs.then(() => {
      const nextJob = this.pendingJobs.values().next().value;
      if (!nextJob) {
        return Promise.resolve();
      }

      this.pendingJobs.delete(nextJob.taskId);

      return this.process(nextJob).catch((error) => {
        logger.error("Failed to generate title", error);
      });
    });

    job.waitUntil?.(this.jobs);
  }

  private async process({
    store,
    taskId,
    messages,
    getModel,
  }: GenerateTitleJob) {
    const task = store.query(makeTaskQuery(taskId));
    if (!task) {
      logger.warn(`Task not found for title generation: ${taskId}`);
      return;
    }

    const newTitle = await generateTaskTitle({
      title: task.title,
      messages,
      getModel,
    });

    if (newTitle !== undefined) {
      store.commit(
        events.updateTitle({
          id: taskId,
          title: newTitle,
          updatedAt: new Date(),
        }),
      );
    }
  }
}

export const generateTitleManager = new GenerateTitleManager();
