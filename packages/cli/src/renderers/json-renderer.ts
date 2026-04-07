import { type BlobStore, type LiveKitStore, catalog } from "@getpochi/livekit";
import type { Message } from "@getpochi/livekit";
import * as runExclusive from "run-exclusive";
import type { NodeChatState } from "../livekit/chat.node";
import type { StreamRenderer } from "./types";
import { inlineSubTask, mapStoreBlob } from "./utils";

export class JsonRenderer implements StreamRenderer {
  private outputMessageIds = new Set<string>();
  private lastMessageCount = 0;
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
    private readonly state: NodeChatState,
  ) {
    this.unsubscribe = this.state.signal.messages.subscribe(
      async (messages) => {
        if (messages.length > this.lastMessageCount) {
          await this.outputMessages(messages.slice(0, -1));
          this.lastMessageCount = messages.length;
        }
      },
    );
  }

  async shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    await this.outputMessages(this.state.signal.messages.value);
    await this.outputFilesData();
  }

  private outputMessages = runExclusive.build(async (messages: Message[]) => {
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
  });

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
