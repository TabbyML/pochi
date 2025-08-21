import type { LanguageModelV2 } from "@ai-sdk/provider";
import { EventSourceParserStream } from "@ai-sdk/provider-utils";
import type { Environment } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import { makeTaskQuery } from "../../livestore/queries";
import { events, tables } from "../../livestore/schema";
import { toTaskStatus } from "../../task";
import type { Message, RequestData } from "../../types";
import type { LLMRequest, OnFinishCallback } from "./types";

export function createPochiModel(
  store: Store | undefined,
  llm: Extract<RequestData["llm"], { type: "pochi" }>,
  payload: LLMRequest,
) {
  const model: LanguageModelV2 = {
    specificationVersion: "v2",
    provider: "Pochi",
    modelId: llm.modelId || "<default>",
    // FIXME(meng): fill supported urls based on modelId.
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt, abortSignal, stopSequences, tools }) => {
      const resp = await llm.apiClient.api.chat.stream.$post(
        {
          json: {
            id: taskId,
            model: llm.modelId,
            modelEndpointId: llm.modelEndpointId,
            callOptions: {
              prompt,
              stopSequences,
              tools,
            },
          },
        },
        {
          init: {
            signal: abortSignal,
          },
        },
      );

      if (!resp.ok || !resp.body) {
        throw new Error(`Failed to fetch: ${resp.status} ${resp.statusText}`);
      }

      const stream = resp.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
          new TransformStream({
            async transform({ data }, controller) {
              if (data === "[DONE]") {
                return;
              }
              controller.enqueue(JSON.parse(data));
            },
          }),
        );
      return { stream };
    },
  };

  const taskId = payload.id;

  const onFinish: OnFinishCallback = async ({ messages }) => {
    const taskId = payload.id;
    if (!store || !taskId) return;

    persistManager.push({
      taskId,
      environment: payload.environment,
      store,
      messages,
      llm,
    });
  };

  return {
    model,
    onFinish,
  };
}

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
  }

  private queue: PersistJob[] = [];

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

  private async loop() {
    while (true) {
      const job = this.queue.shift();
      if (!job) {
        // FIXME: naive implementation of non-busy wait.
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      this.process(job);
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

const persistManager = new PersistManager();
