import {
  type BlobStore,
  type LiveKitStore,
  type Message,
  catalog,
} from "@getpochi/livekit";
import * as R from "remeda";
import * as runExclusive from "run-exclusive";
import type {
  StepDurationEntry,
  StepDurationTracker,
} from "../lib/step-duration-tracker";
import type { NodeChatState } from "../livekit/chat.node";
import type { StreamRenderer } from "./types";
import { inlineSubTask, mapStoreBlob } from "./utils";

export class TrajectoryStreamRenderer implements StreamRenderer {
  private runExclusiveGroup = runExclusive.createGroupRef();
  private emittedParts = new Map<string, unknown>();
  private emittedMetadata = new Set<string>();
  private emittedStepDurationEntryCount = 0;
  private unsubscribeFns: (() => void)[] | undefined;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
    private readonly state: NodeChatState,
    stepDurationTracker?: StepDurationTracker,
  ) {
    this.unsubscribeFns = [
      this.state.signal.messages.subscribe(async (messages: Message[]) => {
        await this.outputTrajectory(messages);
      }),
    ];
    if (stepDurationTracker) {
      this.unsubscribeFns.push(
        stepDurationTracker.entries.subscribe(async (entries) => {
          await this.outputStepDurationEntries(entries);
        }),
      );
    }
  }

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

          const resolvedPart = await mapStoreBlob(this.blobStore, part);

          const cachedPart = this.emittedParts.get(partId);
          if (!R.isDeepEqual(cachedPart, resolvedPart)) {
            const outputData = {
              type: "message-part",
              timestamp: new Date().toISOString(),
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
    },
  );

  private outputStepDurationEntries = runExclusive.build(
    this.runExclusiveGroup,
    async (entries: StepDurationEntry[]) => {
      for (
        let i = this.emittedStepDurationEntryCount;
        i < entries.length;
        i++
      ) {
        const entry = entries[i];
        const outputData = {
          type: "step-duration",
          taskId: entry.taskId,
          messageId: entry.messageId,
          stepIndex: entry.stepIndex,
          hasError: entry.hasError,
          startedAt: entry.startedAt.toISOString(),
          finishedAt: entry.finishedAt.toISOString(),
          duration: entry.duration,
        };
        this.stream.write(`${JSON.stringify(outputData)}\n`);
      }
      this.emittedStepDurationEntryCount = entries.length;
    },
  );

  private outputFilesData = runExclusive.build(
    this.runExclusiveGroup,
    async () => {
      const files = this.store.query(catalog.queries.makeStoreFilesQuery());
      if (files.length > 0) {
        const data = {
          type: "files",
          files,
        };
        this.stream.write(`${JSON.stringify(data)}\n`);
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
    await this.outputTrajectory(this.state.signal.messages.value, true);
    await this.outputFilesData();
  }
}
