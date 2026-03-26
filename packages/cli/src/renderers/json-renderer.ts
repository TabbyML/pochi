import { type BlobStore, type LiveKitStore, catalog } from "@getpochi/livekit";
import type { Message } from "@getpochi/livekit";
import { isToolUIPart } from "ai";
import * as runExclusive from "run-exclusive";
import type { NodeChatState } from "../livekit/chat.node";
import type { StreamRenderer } from "./types";
import { inlineSubTask, mapStoreBlob } from "./utils";

export interface JsonRendererOptions {
  mode: "full" | "result-only";
  attemptCompletionSchemaOverride?: boolean;
}

export class JsonRenderer implements StreamRenderer {
  private outputMessageIds = new Set<string>();
  private lastMessageCount = 0;
  private mode: "full" | "result-only";
  private attemptCompletionSchemaOverride: boolean;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
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
      await this.outputFilesData();
    }
  }

  private outputResult() {
    const messages = this.state.signal.messages.value;
    const lastMessage = messages.at(-1);

    if (lastMessage?.role === "assistant") {
      for (const part of lastMessage.parts || []) {
        if (isToolUIPart(part) && part.type === "tool-attemptCompletion") {
          if (part.input) {
            const input = part.input as Record<string, unknown>;
            if (this.attemptCompletionSchemaOverride) {
              this.stream.write(`${JSON.stringify(input.result, null, 2)}\n`);
            } else {
              this.stream.write(`${input.result}\n`);
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
        let outputMessage = await inlineSubTask(this.store, message);
        outputMessage = (await mapStoreBlob(
          this.blobStore,
          outputMessage,
        )) as Message;
        this.stream.write(`${JSON.stringify(outputMessage)}\n`);
        this.outputMessageIds.add(message.id);
      }
    }
  }

  private async outputFilesData() {
    const files = this.store.query(catalog.queries.makeStoreFilesQuery());
    if (files.length > 0) {
      const data = {
        type: "files",
        files,
      };
      this.stream.write(`${JSON.stringify(data)}\n`);
    }
  }
}
