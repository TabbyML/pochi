import { randomUUID } from "node:crypto";
import { type Dirent, createWriteStream, mkdirSync, openSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { TerminalOutputRetentionMs } from "./limits";
import { getPochiDataDir, getTaskDataDir } from "./pochi-paths";

export type BackgroundJobId =
  | `bgjob-cmd-${string}`
  | `bgjob-monitor-${string}`
  | `bgjob-task-${string}`
  | `term-${string}`;

export type BackgroundJobIdType = "command" | "monitor" | "task" | "terminal";

export function createBackgroundJobId(
  type: BackgroundJobIdType,
): BackgroundJobId {
  const suffix = randomUUID();
  switch (type) {
    case "command":
      return `bgjob-cmd-${suffix}`;
    case "monitor":
      return `bgjob-monitor-${suffix}`;
    case "task":
      return `bgjob-task-${suffix}`;
    case "terminal":
      return `term-${suffix}`;
  }
}

export function parseBackgroundJobId(
  id: string,
): BackgroundJobIdType | undefined {
  if (id.startsWith("bgjob-cmd-")) return "command";
  if (id.startsWith("bgjob-monitor-")) return "monitor";
  if (id.startsWith("bgjob-task-")) return "task";
  if (id.startsWith("term-")) return "terminal";
  return undefined;
}

export function getBackgroundJobOutputPath(
  taskId: string,
  backgroundJobId: string,
): string {
  return path.join(
    getTaskDataDir(taskId),
    "background-jobs",
    `${backgroundJobId}.log`,
  );
}

export function getTerminalOutputPath(terminalId: string): string {
  return path.join(getPochiDataDir(), "terminals", `${terminalId}.log`);
}

export async function cleanupStaleTerminalOutputFiles(
  terminalOutputDir = path.join(getPochiDataDir(), "terminals"),
  now = Date.now(),
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(terminalOutputDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  const cutoff = now - TerminalOutputRetentionMs;
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^term-[^/]+\.log$/.test(entry.name))
      .map(async (entry) => {
        const outputFile = path.join(terminalOutputDir, entry.name);
        const fileStat = await stat(outputFile);
        if (fileStat.mtimeMs <= cutoff) {
          await rm(outputFile, { force: true });
        }
      }),
  );
}

export class BackgroundJobOutputFile {
  private error: Error | undefined;
  private closed = false;
  private readonly stream;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(readonly outputFile: string) {
    mkdirSync(path.dirname(outputFile), { recursive: true });
    const fd = openSync(outputFile, "wx", 0o600);
    this.stream = createWriteStream(outputFile, {
      fd,
      autoClose: true,
      encoding: "utf8",
    });
    this.stream.on("error", (error) => {
      this.error = error;
    });
  }

  append(chunk: string | Buffer): Promise<void> {
    if (this.closed) {
      return Promise.reject(
        new Error(`Background job output file is closed: ${this.outputFile}`),
      );
    }

    const write = this.writeTail.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (this.error) {
            reject(this.error);
            return;
          }

          // Waiting for the write callback both preserves ordering and keeps
          // at most one chunk queued in the writable stream. This naturally
          // applies backpressure to callers that await append().
          this.stream.write(chunk, (error?: Error | null) => {
            const streamError = error ?? this.error;
            if (streamError) reject(streamError);
            else resolve();
          });
        }),
    );
    // Keep the serialization chain usable after a failed write while still
    // returning the original rejection to this caller.
    this.writeTail = write.catch(() => undefined);
    return write;
  }

  async close(): Promise<void> {
    if (this.closed) {
      if (this.error) throw this.error;
      return;
    }
    this.closed = true;

    await this.writeTail;

    await new Promise<void>((resolve, reject) => {
      this.stream.end((error?: Error | null) => {
        const streamError = error ?? this.error;
        if (streamError) reject(streamError);
        else resolve();
      });
    });
  }
}
