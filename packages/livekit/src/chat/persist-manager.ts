import { type Environment, getLogger } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { makeTaskQuery } from "../livestore/queries";
import { events, tables } from "../livestore/schema";
import { toTaskStatus } from "../task";
import type { Message, RequestData } from "../types";

const logger = getLogger("PersistManager");

interface PersistJob {
  taskId: string;
  store: Store;
  messages: Message[];
  llm: Extract<RequestData["llm"], { type: "pochi" }>;
  environment?: Environment;
}

class PersistManager {
  constructor() {
    this.loop();

    if (isNodeEnvironment()) {
      const handleShutdown = async (
        reason: "SIGTERM" | "SIGINT" | "beforeExit",
        code: number,
      ) => {
        logger.debug(`Received ${reason}, shutting down gracefully...`);
        await this.shutdown();
        process.exit(code);
      };

      process.on("SIGTERM", () => handleShutdown("SIGTERM", 143));
      process.on("SIGINT", () => handleShutdown("SIGINT", 130));
      process.on("beforeExit", (code) => handleShutdown("beforeExit", code));
    }
  }

  private queue: PersistJob[] = [];
  private isShutdownInProgress = false;

  push(job: PersistJob) {
    const existingJobIndex = this.queue.findIndex(
      (j) => j.taskId === job.taskId,
    );

    if (existingJobIndex >= 0) {
      this.queue[existingJobIndex] = job;
    } else {
      this.queue.push(job);
    }
  }

  private async shutdown() {
    if (this.isShutdownInProgress) {
      logger.error("Shutdown already in progress");
      return;
    }

    this.isShutdownInProgress = true;
    try {
      await Promise.all(this.queue.map((x) => this.process(x)));
    } catch (err) {
      logger.error("Error during shutdown", err);
    }
  }

  private async loop() {
    while (true) {
      if (this.isShutdownInProgress) {
        break;
      }

      const job = this.queue.shift();
      if (!job) {
        // FIXME: naive implementation of non-busy wait.
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      try {
        await this.process(job);
      } catch (err) {
        logger.error("Failed to persist chat", err);
      }
    }
  }

  private async process({
    taskId,
    store,
    messages,
    llm,
    environment,
  }: PersistJob) {
    const lastMessage = messages.at(-1);
    if (!lastMessage) {
      throw new Error("No messages to persist");
    }
    const { parentId } = store.query(makeTaskQuery(taskId)) || {};
    const finishReason =
      lastMessage.metadata?.kind === "assistant"
        ? lastMessage.metadata.finishReason
        : undefined;
    const resp = await llm.apiClient.api.chat.persist.$post({
      json: {
        id: taskId,
        messages,
        environment,
        status: toTaskStatus(lastMessage, finishReason),
        parentClientTaskId: parentId ?? undefined,
      },
    });

    if (resp.status !== 200) {
      throw new Error(`Failed to persist chat: ${resp.statusText}`);
    }

    const { shareId } = (await resp.json()) as { shareId: string };
    const existingShareId = store.query(
      tables.tasks
        .select("shareId")
        .where("id", "=", taskId)
        .first({ fallback: () => null }),
    );
    if (!existingShareId) {
      store.commit(
        events.updateShareId({
          id: taskId,
          shareId,
          updatedAt: new Date(),
        }),
      );
    }
  }
}

function isNodeEnvironment() {
  return typeof process === "object" && process.on;
}

export const persistManager = new PersistManager();
