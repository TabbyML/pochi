import {
  type BlobStore,
  type LiveKitStore,
  type Message,
  catalog,
} from "@getpochi/livekit";
import * as runExclusive from "run-exclusive";
import type { NodeChatState } from "../livekit/chat.node";
import {
  type FilesLine,
  type MessageMetadataLine,
  type MessagePartLine,
  type TrajectoryLine,
  getFingerprint,
} from "./trajectory-types";
import type { StreamRenderer } from "./types";
import { mapStoreBlob } from "./utils";

export class TrajectoryStreamRenderer implements StreamRenderer {
  private readonly unsubscribeFns: (() => void)[] = [];
  private readonly runExclusiveGroup = runExclusive.createGroupRef();

  // Save fingerprint of each output line
  private readonly writtenLines: string[] = [];
  // Skip line fingerprints
  private readonly skipLines: readonly string[] | undefined;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly store: LiveKitStore,
    private readonly blobStore: BlobStore,
    readonly mainTaskChatState: NodeChatState,
    readonly options?: {
      readonly skipLineFingerprints?: readonly string[] | undefined;
    },
  ) {
    this.skipLines = options?.skipLineFingerprints;

    this.unsubscribeFns.push(
      mainTaskChatState.signal.messages.subscribe(
        async (messages: Message[]) => {
          await this.outputTrajectory(messages, undefined);
        },
      ),
    );
  }

  addSubTask(taskId: string, taskChatState: NodeChatState) {
    this.unsubscribeFns.push(
      taskChatState.signal.messages.subscribe(async (messages: Message[]) => {
        await this.outputTrajectory(messages, taskId);
      }),
    );
  }

  private shouldWrite(lineFingerprint: string): boolean {
    // Scan from the end since duplicates are most likely recent
    for (let i = this.writtenLines.length - 1; i >= 0; i--) {
      if (this.writtenLines[i] === lineFingerprint) {
        return false;
      }
    }

    if (this.skipLines?.includes(lineFingerprint)) {
      return false;
    }

    return true;
  }

  private writeTrajectoryLine = (line: TrajectoryLine) => {
    this.stream.write(`${JSON.stringify(line)}\n`);
  };

  private outputTrajectory = runExclusive.build(
    this.runExclusiveGroup,
    async (messages: Message[], taskId: string | undefined) => {
      for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
        const message = messages[msgIdx];
        for (let i = 0; i < message.parts.length; i++) {
          const part = message.parts[i];
          const resolvedPart = (await mapStoreBlob(
            this.blobStore,
            part,
          )) as Message["parts"][number];

          const line = {
            type: "message-part",
            timestamp: new Date(),
            taskId,
            messageId: message.id,
            role: message.role,
            index: i,
            part: resolvedPart,
          } satisfies MessagePartLine;

          const lineFingerprint = getFingerprint(line);
          if (this.shouldWrite(lineFingerprint)) {
            this.writeTrajectoryLine(line);
            this.writtenLines.push(lineFingerprint);
          }
        }

        if (message.metadata !== undefined) {
          const line = {
            type: "message-metadata",
            messageId: message.id,
            role: message.role,
            metadata: message.metadata,
          } satisfies MessageMetadataLine;

          const lineFingerprint = getFingerprint(line);
          if (this.shouldWrite(lineFingerprint)) {
            this.writeTrajectoryLine(line);
            this.writtenLines.push(lineFingerprint);
          }
        }
      }
    },
  );

  private outputFilesData = runExclusive.build(
    this.runExclusiveGroup,
    async () => {
      const files = this.store.query(catalog.queries.makeStoreFilesQuery());
      if (files.length > 0) {
        const line = {
          type: "files",
          files,
        } satisfies FilesLine;

        const lineFingerprint = getFingerprint(line);
        if (this.shouldWrite(lineFingerprint)) {
          this.writeTrajectoryLine(line);
          this.writtenLines.push(lineFingerprint);
        }
      }
    },
  );

  async shutdown() {
    if (this.unsubscribeFns?.length) {
      for (const fn of this.unsubscribeFns) {
        fn();
      }
    }
    await this.outputFilesData();
  }
}
