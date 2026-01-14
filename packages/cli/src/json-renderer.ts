import {
  type LiveKitStore,
  type Message,
  StoreBlobProtocol,
  catalog,
} from "@getpochi/livekit";
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
    private readonly state: NodeChatState,
    options: JsonRendererOptions = { mode: "full" },
  ) {
    this.mode = options.mode;
    if (this.mode === "full") {
      this.state.signal.messages.subscribe((messages) => {
        if (messages.length > this.lastMessageCount) {
          this.outputMessages(messages.slice(0, -1));
          this.lastMessageCount = messages.length;
        }
      });
    }
  }
  shutdown() {
    if (this.mode === "result-only") {
      this.outputResult();
    } else {
      this.outputMessages(this.state.signal.messages.value);
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

  private outputMessages(messages: Message[]) {
    for (const message of messages) {
      if (!this.outputMessageIds.has(message.id)) {
        console.log(JSON.stringify(mapStoreBlob(this.store, message)));
        this.outputMessageIds.add(message.id);
      }
    }
  }
}

function mapStoreBlob(store: LiveKitStore, o: unknown): unknown {
  if (R.isString(o) && o.startsWith(StoreBlobProtocol)) {
    const url = new URL(o);
    const blob = store.query(catalog.queries.makeBlobQuery(url.pathname));
    if (!blob) throw new Error(`Store blob not found at "${url.pathname}"`);
    const base64 = Buffer.from(blob.data).toString("base64");
    return `data:${blob.mimeType};base64,${base64}`;
  }

  if (R.isArray(o)) {
    return o.map((el) => mapStoreBlob(store, el));
  }

  if (R.isObjectType(o)) {
    return R.mapValues(o, (v) => mapStoreBlob(store, v));
  }

  return o;
}
