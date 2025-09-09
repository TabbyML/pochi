import type { LanguageModelV2 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { makeTaskQuery } from "../../livestore/queries";
import { events } from "../../livestore/schema";
import type { Message } from "../../types";
import { generateTaskTitle } from "../llm/generate-task-title";
import { backgroundJobManager } from "./manager";

const logger = getLogger("GenerateTitleManager");

interface GenerateTitleJob {
  taskId: string;
  store: Store;
  messages: Message[];
  getModel: () => LanguageModelV2;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function scheduleGenerateTitleJob(job: GenerateTitleJob) {
  backgroundJobManager.push({
    id: `generate-title-${job.taskId}`,
    waitUntil: job.waitUntil,
    process: () => process(job),
  });
}

async function process({
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
