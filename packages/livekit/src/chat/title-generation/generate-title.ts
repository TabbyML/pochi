import type { LanguageModelV3 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type { BlobStore } from "../../blob-store";
import { makeTaskQuery } from "../../livestore/default-queries";
import { events } from "../../livestore/default-schema";

import type { LiveKitStore, Message, Task } from "../../types";
import { generateTaskTitle } from "../llm/generate-task-title";
import { titleGenerationQueue } from "./title-generation-queue";

const logger = getLogger("GenerateTitle");

interface GenerateTitleJob {
  taskId: string;
  store: LiveKitStore;
  blobStore: BlobStore;
  messages: Message[];
  getModel: () => LanguageModelV3;
  onTitleUpdated?: (previousTask: Task) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function scheduleGenerateTitleJob(job: GenerateTitleJob) {
  titleGenerationQueue.push({
    id: `generate-title-${job.taskId}`,
    waitUntil: job.waitUntil,
    process: () => process(job),
  });
}

async function process({
  store,
  blobStore,
  taskId,
  messages,
  getModel,
  onTitleUpdated,
}: GenerateTitleJob) {
  const task = store.query(makeTaskQuery(taskId));
  if (!task) {
    logger.warn(`Task not found for title generation: ${taskId}`);
    return;
  }

  const newTitle = await generateTaskTitle({
    store,
    blobStore,
    taskId,
    title: task.title,
    messages,
    getModel,
  });

  if (newTitle !== undefined) {
    // The turn can finish while the title model is running. Capture the
    // current status and timestamp before UpdateTitle changes updatedAt.
    const previousTask = store.query(makeTaskQuery(taskId));
    if (!previousTask || previousTask.title === newTitle) return;
    store.commit(
      events.updateTitle({
        id: taskId,
        title: newTitle,
        updatedAt: new Date(),
      }),
    );
    onTitleUpdated?.(previousTask);
  }
}
