import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { BackgroundJobInitialOutput } from "./background-job-manager";

const ForegroundReplayMaxCharacters = 1024 * 1024;

type OutputChannel = "stdout" | "stderr";

interface ReplayChunk {
  channel: OutputChannel;
  value: string;
}

interface StreamCapture {
  stream: Readable;
  outputPath: string;
  writer: ReturnType<typeof createWriteStream>;
  writerFinished: Promise<void>;
  decoder: StringDecoder;
  onData: (chunk: Buffer | string) => void;
}

export class ForegroundOutputCapture {
  private readonly replayChunks: ReplayChunk[] = [];
  private replayCharacters = 0;
  private stopped = false;
  private disposed = false;
  private readonly stdoutCapture: StreamCapture;
  private readonly stderrCapture: StreamCapture;

  constructor(
    stdout: Readable,
    stderr: Readable,
    private readonly maxReplayCharacters = ForegroundReplayMaxCharacters,
  ) {
    this.stdoutCapture = this.createStreamCapture("stdout", stdout);
    this.stderrCapture = this.createStreamCapture("stderr", stderr);
  }

  private createStreamCapture(
    channel: OutputChannel,
    stream: Readable,
  ): StreamCapture {
    const outputPath = path.join(
      tmpdir(),
      `pochi-foreground-${randomUUID()}-${channel}.log`,
    );
    const writer = createWriteStream(outputPath, { flags: "wx" });
    const writerFinished = new Promise<void>((resolve, reject) => {
      writer.once("finish", resolve);
      writer.once("error", reject);
    });
    void writerFinished.catch(() => undefined);
    const decoder = new StringDecoder("utf8");
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.appendReplay(channel, decoder.write(buffer));
      if (!writer.write(buffer)) {
        stream.pause();
        writer.once("drain", () => {
          if (!this.stopped) stream.resume();
        });
      }
    };
    stream.on("data", onData);

    return { stream, outputPath, writer, writerFinished, decoder, onData };
  }

  private appendReplay(channel: OutputChannel, value: string): void {
    if (value.length === 0) return;
    this.replayChunks.push({ channel, value });
    this.replayCharacters += value.length;

    while (this.replayCharacters > this.maxReplayCharacters) {
      const firstChunk = this.replayChunks[0];
      if (!firstChunk) break;
      const overflow = this.replayCharacters - this.maxReplayCharacters;
      if (firstChunk.value.length <= overflow) {
        this.replayChunks.shift();
        this.replayCharacters -= firstChunk.value.length;
      } else {
        firstChunk.value = firstChunk.value.slice(overflow);
        this.replayCharacters -= overflow;
      }
    }
  }

  private stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const capture of [this.stdoutCapture, this.stderrCapture]) {
      capture.stream.pause();
      capture.stream.removeListener("data", capture.onData);
      capture.writer.end();
    }
  }

  async finish(): Promise<{ stdout: string; stderr: string }> {
    this.stop();
    this.appendReplay("stdout", this.stdoutCapture.decoder.end());
    this.appendReplay("stderr", this.stderrCapture.decoder.end());

    try {
      await Promise.all([
        this.stdoutCapture.writerFinished,
        this.stderrCapture.writerFinished,
      ]);
      let stdout = "";
      let stderr = "";
      for (const chunk of this.replayChunks) {
        if (chunk.channel === "stdout") stdout += chunk.value;
        else stderr += chunk.value;
      }
      return { stdout, stderr };
    } finally {
      await this.dispose();
    }
  }

  promote(): BackgroundJobInitialOutput {
    this.stop();
    return {
      stdout: this.readCapture(this.stdoutCapture),
      stderr: this.readCapture(this.stderrCapture),
      dispose: () => this.dispose(),
    };
  }

  private async *readCapture(
    capture: StreamCapture,
  ): AsyncGenerator<Buffer, void, void> {
    await capture.writerFinished;
    for await (const chunk of createReadStream(capture.outputPath)) {
      yield chunk;
    }
  }

  private async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await Promise.allSettled([
      this.stdoutCapture.writerFinished,
      this.stderrCapture.writerFinished,
    ]);
    await Promise.all([
      rm(this.stdoutCapture.outputPath, { force: true }),
      rm(this.stderrCapture.outputPath, { force: true }),
    ]);
  }
}
