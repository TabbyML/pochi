import type { BlobStore } from "@getpochi/livekit";
import type { LiveKitStore, Message } from "@getpochi/livekit";

import { isToolUIPart } from "ai";

import * as R from "remeda";
import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export interface JsonRendererOptions {
  mode: "full" | "result-only";
}

export class JsonRenderer {
  private outputMessageIds = new Set<string>();
  private lastMessageCount = 0;
  private mode: "full" | "result-only";

  constructor(
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
    private readonly state: NodeChatState,
    options: JsonRendererOptions = { mode: "full" },
  ) {
    this.mode = options.mode;
    if (this.mode === "full") {
      this.state.signal.messages.subscribe(async (messages) => {
        if (messages.length > this.lastMessageCount) {
          await this.outputMessages(messages.slice(0, -1));
          this.lastMessageCount = messages.length;
        }
      });
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
            const result = (part.input as { result?: string }).result || "";
            console.log(result);
          }
          return;
        }
      }
    }
  }

  private async outputMessages(messages: Message[]) {
    for (const message of messages) {
      if (!this.outputMessageIds.has(message.id)) {
        console.log(
          JSON.stringify(await mapStoreBlob(this.blobStore, message)),
        );
        this.outputMessageIds.add(message.id);
      }
    }
  }
}

async function mapStoreBlob(
  blobStore: BlobStore,
  o: unknown,
): Promise<unknown> {
  if (R.isString(o) && o.startsWith(blobStore.protocol)) {
    const blob = await blobStore.get(o);
    if (!blob) throw new Error(`Store blob not found at "${o}"`);

    const base64 = Buffer.from(blob.data).toString("base64");
    return `data:${blob.mimeType};base64,${base64}`;
  }

  if (R.isArray(o)) {
    return Promise.all(o.map((el) => mapStoreBlob(blobStore, el)));
  }

  if (R.isObjectType(o)) {
    return R.mapValues(o, (v) => mapStoreBlob(blobStore, v));
  }

  return o;
}
