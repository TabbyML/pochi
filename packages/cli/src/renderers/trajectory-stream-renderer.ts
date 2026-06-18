import {
  type BlobStore,
  type LiveKitStore,
  type Message,
  catalog,
} from "@getpochi/livekit";
import * as R from "remeda";
import * as runExclusive from "run-exclusive";
import type {
  StepMetadataEntry,
  StepMetadataTracker,
} from "../lib/step-metadata-tracker";
import type { NodeChatState } from "../livekit/chat.node";
import type {
  FilesLine,
  MessageMetadataLine,
  MessagePartLine,
  StepMetadataLine,
  TrajectoryLine,
} from "./trajectory-types";
import type { StreamRenderer } from "./types";
import { inlineSubTask, mapStoreBlob } from "./utils";

export class TrajectoryStreamRenderer implements StreamRenderer {
  private runExclusiveGroup = runExclusive.createGroupRef();
  private emittedParts = new Map<string, unknown>();
  private emittedMetadata = new Set<string>();
  private emittedStepMetadataEntryCount = 0;
  private unsubscribeFns: (() => void)[] | undefined;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
    private readonly state: NodeChatState,
    private readonly stepMetadataTracker?: StepMetadataTracker,
  ) {
    this.unsubscribeFns = [
      this.state.signal.messages.subscribe(async (messages: Message[]) => {
        await this.outputTrajectory(messages);
      }),
    ];
    if (stepMetadataTracker) {
      this.unsubscribeFns.push(
        stepMetadataTracker.entries.subscribe(async (entries) => {
          await this.outputStepMetadataEntries(entries);
        }),
      );
    }
  }

  private writeTrajectoryLine = (line: TrajectoryLine) => {
    this.stream.write(`${JSON.stringify(line)}\n`);
  };

  private outputTrajectory = runExclusive.build(
    this.runExclusiveGroup,
    async (messages: Message[], isFinalFlush = false) => {
      for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
        const message = messages[msgIdx];
        const isFinalized = isFinalFlush || msgIdx < messages.length - 1;

        const outputMessage = await inlineSubTask(this.store, message);

        for (let i = 0; i < outputMessage.parts.length; i++) {
          const part = outputMessage.parts[i];

          const partId = `${message.id}:${i}`;

          const resolvedPart = (await mapStoreBlob(
            this.blobStore,
            part,
          )) as Message["parts"][number];

          const cachedPart = this.emittedParts.get(partId);
          if (!R.isDeepEqual(cachedPart, resolvedPart)) {
            this.writeTrajectoryLine({
              type: "message-part",
              timestamp: new Date(),
              messageId: message.id,
              role: message.role,
              index: i,
              part: resolvedPart,
            } satisfies MessagePartLine);
            this.emittedParts.set(partId, R.clone(resolvedPart));
          }
        }

        if (isFinalized && !this.emittedMetadata.has(message.id)) {
          if (outputMessage.metadata !== undefined) {
            this.writeTrajectoryLine({
              type: "message-metadata",
              messageId: message.id,
              role: message.role,
              metadata: outputMessage.metadata,
            } satisfies MessageMetadataLine);
          }
          this.emittedMetadata.add(message.id);
        }
      }
    },
  );

  private outputStepMetadataEntries = runExclusive.build(
    this.runExclusiveGroup,
    async (entries: StepMetadataEntry[]) => {
      for (
        let i = this.emittedStepMetadataEntryCount;
        i < entries.length;
        i++
      ) {
        const entry = entries[i];
        this.writeTrajectoryLine({
          type: "step-metadata",
          ...entry,
        } satisfies StepMetadataLine);
      }
      this.emittedStepMetadataEntryCount = entries.length;
    },
  );

  private outputFilesData = runExclusive.build(
    this.runExclusiveGroup,
    async () => {
      const files = this.store.query(catalog.queries.makeStoreFilesQuery());
      if (files.length > 0) {
        this.writeTrajectoryLine({
          type: "files",
          files,
        } satisfies FilesLine);
      }
    },
  );

  async shutdown() {
    if (this.unsubscribeFns?.length) {
      for (const fn of this.unsubscribeFns) {
        fn();
      }
      this.unsubscribeFns = undefined;
    }
    if (this.stepMetadataTracker) {
      await this.outputStepMetadataEntries(
        this.stepMetadataTracker.entries.value,
      );
    }
    await this.outputTrajectory(this.state.signal.messages.value, true);
    await this.outputFilesData();
  }
}
