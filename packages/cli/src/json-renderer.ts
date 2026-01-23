import type { BlobStore } from "@getpochi/livekit";
import type { Message } from "@getpochi/livekit";

import { isToolUIPart } from "ai";

import * as R from "remeda";
import * as runExclusive from "run-exclusive";
import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export interface JsonRendererOptions {
  mode: "full" | "result-only";
  attemptCompletionSchemaOverride?: boolean;
}

export class JsonRenderer {
  private outputMessageIds = new Set<string>();
  private lastMessageCount = 0;
  private mode: "full" | "result-only";
  private attemptCompletionSchemaOverride: boolean;

  constructor(
    private readonly store: BlobStore,
    private readonly state: NodeChatState,
    options: JsonRendererOptions = { mode: "full" },
  ) {
    this.mode = options.mode;
    this.attemptCompletionSchemaOverride =
      !!options.attemptCompletionSchemaOverride;
    if (this.mode === "full") {
      this.state.signal.messages.subscribe(
        runExclusive.build(async (messages) => {
          if (messages.length > this.lastMessageCount) {
            await this.outputMessages(messages.slice(0, -1));
            this.lastMessageCount = messages.length;
          }
        }),
      );
    }
  }
  async shutdown() {
    if (this.mode === "result-only") {
      this.outputResult();
    } else {
      await this.outputMessages(this.state.signal.messages.value);
    }
  }

  renderSubTask(_task: TaskRunner) {}

  private outputResult() {
    const messages = this.state.signal.messages.value;
    const lastMessage = messages.at(-1);

    if (lastMessage?.role === "assistant") {
      for (const part of lastMessage.parts || []) {
        if (isToolUIPart(part) && part.type === "tool-attemptCompletion") {
          if (part.input) {
            const input = part.input as Record<string, unknown>;
            if (
              !this.attemptCompletionSchemaOverride &&
              "result" in input &&
              typeof input.result === "string"
            ) {
              console.log(input.result);
            } else {
              console.log(JSON.stringify(input, null, 2));
            }
          }
          return;
        }
      }
    }
  }

  private async outputMessages(messages: Message[]) {
    for (const message of messages) {
      if (!this.outputMessageIds.has(message.id)) {
        console.log(JSON.stringify(await mapStoreBlob(this.store, message)));
        this.outputMessageIds.add(message.id);
      }
    }
  }
}

async function mapStoreBlob(store: BlobStore, o: unknown): Promise<unknown> {
  if (R.isString(o) && o.startsWith(store.protocol)) {
    const blob = await store.get(o);
    if (!blob) throw new Error(`Store blob not found at "${o}"`);

    const base64 = Buffer.from(blob.data).toString("base64");
    return `data:${blob.mimeType};base64,${base64}`;
  }

  if (R.isArray(o)) {
    return Promise.all(o.map((el) => mapStoreBlob(store, el)));
  }

  if (R.isObjectType(o)) {
    const entires = await Promise.all(
      R.entries(o as Record<string, unknown>).map(
        async ([k, v]): Promise<[string, unknown]> => [
          k,
          await mapStoreBlob(store, v),
        ],
      ),
    );
    return R.fromEntries(entires);
  }

  return o;
}
