import {
  type BlobStore,
  type LiveKitStore,
  type Message,
  catalog,
} from "@getpochi/livekit";
import * as R from "remeda";
import * as runExclusive from "run-exclusive";
import type { NodeChatState } from "../livekit/chat.node";
import type { StreamRenderer } from "./types";
import { inlineSubTask, mapStoreBlob } from "./utils";

export class ExperimentalTrajectoryStreamRenderer implements StreamRenderer {
  private emittedParts = new Map<string, unknown>();
  private emittedMetadata = new Set<string>();
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
    private readonly state: NodeChatState,
  ) {
    this.unsubscribe = this.state.signal.messages.subscribe(
      runExclusive.build(async (messages: Message[]) => {
        await this.outputTrajectory(messages);
      }),
    );
  }

  private async outputTrajectory(messages: Message[], isFinalFlush = false) {
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const message = messages[msgIdx];
      const isFinalized = isFinalFlush || msgIdx < messages.length - 1;

      const outputMessage = await inlineSubTask(this.store, message);

      for (let i = 0; i < outputMessage.parts.length; i++) {
        const part = outputMessage.parts[i];

        const partId = `${message.id}:${i}`;

        const resolvedPart = await mapStoreBlob(this.blobStore, part);

        const cachedPart = this.emittedParts.get(partId);
        if (!R.isDeepEqual(cachedPart, resolvedPart)) {
          const outputData = {
            type: "message-part",
            messageId: message.id,
            role: message.role,
            index: i,
            part: resolvedPart,
          };
          this.stream.write(`${JSON.stringify(outputData)}\n`);
          this.emittedParts.set(partId, R.clone(resolvedPart));
        }
      }

      if (isFinalized && !this.emittedMetadata.has(message.id)) {
        if (outputMessage.metadata !== undefined) {
          const outputData = {
            type: "message-metadata",
            messageId: message.id,
            role: message.role,
            metadata: outputMessage.metadata,
          };
          this.stream.write(`${JSON.stringify(outputData)}\n`);
        }
        this.emittedMetadata.add(message.id);
      }
    }
  }

  async shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    // Final flush of messages
    await runExclusive.build(async () => {
      await this.outputTrajectory(this.state.signal.messages.value, true);
      await this.outputFilesData();
    })();
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
