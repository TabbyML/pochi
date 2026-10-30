import fs from "node:fs/promises";
import path from "node:path";
import type { AutoMemoryManager } from "../auto-memory/node";
import {
  type TaskHistoryContext,
  TaskIndexName,
  getLogger,
  renderTaskIndex,
  toErrorMessage,
} from "../base";

const logger = getLogger("TaskHistory");

/** The transcripts are owned by long-term memory; the index only reads them. */
export type TaskTranscriptSource = Pick<
  AutoMemoryManager,
  "readContext" | "listTranscripts"
>;

const pendingSyncs = new Map<string, Promise<void>>();
const MaxSyncAttempts = 5;

/**
 * Regenerates INDEX.md for the repository containing `cwd` from its
 * transcript listing and returns where the index and transcripts live. Syncs
 * of the same directory run one after another so a slower, older listing
 * never overwrites a newer one.
 */
export async function syncTaskIndex(
  source: TaskTranscriptSource,
  cwd: string | undefined,
): Promise<TaskHistoryContext | undefined> {
  // Resolves paths only: the memory directories are left untouched.
  const context = await source.readContext(cwd, { ensure: false });
  if (!context) return undefined;
  const { transcriptDir } = context;

  const previous = pendingSyncs.get(transcriptDir) ?? Promise.resolve();
  const next = previous.then(() => writeTaskIndex(source, cwd, transcriptDir));
  pendingSyncs.set(transcriptDir, next);
  void next.finally(() => {
    if (pendingSyncs.get(transcriptDir) === next) {
      pendingSyncs.delete(transcriptDir);
    }
  });
  await next;
  return { indexPath: path.join(transcriptDir, TaskIndexName), transcriptDir };
}

async function writeTaskIndex(
  source: TaskTranscriptSource,
  cwd: string | undefined,
  transcriptDir: string,
): Promise<void> {
  try {
    const indexPath = path.join(transcriptDir, TaskIndexName);
    // Other processes (VS Code windows) sync the same directory outside our
    // queue and may replace the index with an older listing. Re-list after
    // each write until the file matches: whoever writes last then verifies
    // last, so the final index reflects every transcript.
    for (let attempt = 0; attempt < MaxSyncAttempts; attempt++) {
      const transcripts = await source.listTranscripts({ cwd });
      const content = renderTaskIndex(
        transcripts.map((transcript) => ({
          transcriptFilename: path.basename(transcript.filePath),
          title: transcript.title,
          updatedAt: transcript.updatedAt,
        })),
      );
      const existing = await fs
        .readFile(indexPath, "utf8")
        .catch(() => undefined);
      if (existing === content) return;
      // Atomic replace, so readers never see a partial file.
      await fs.mkdir(transcriptDir, { recursive: true });
      const tmpPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmpPath, content);
      await fs.rename(tmpPath, indexPath);
    }
    logger.warn("Task index kept changing; leaving the next sync to settle it");
  } catch (error) {
    logger.warn(`Failed to write task index: ${toErrorMessage(error)}`);
  }
}
