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

const pendingSyncs = new Map<string, Promise<boolean>>();
const MaxSyncAttempts = 5;

/**
 * Regenerates the task index for the repository containing `cwd` from its
 * transcript listing. Returns where the index and transcripts live, or
 * `undefined` when there is no readable index to point at.
 */
export async function syncTaskIndex(
  source: TaskTranscriptSource,
  cwd: string | undefined,
): Promise<TaskHistoryContext | undefined> {
  const context = await resolveTaskHistory(source, cwd);
  if (!context) return undefined;
  return (await enqueueSync(source, cwd, context)) ? context : undefined;
}

/**
 * Like {@link syncTaskIndex}, but does not wait for the transcript scan when
 * an index already exists: it is refreshed in the background instead.
 */
export async function readTaskIndex(
  source: TaskTranscriptSource,
  cwd: string | undefined,
): Promise<TaskHistoryContext | undefined> {
  const context = await resolveTaskHistory(source, cwd);
  if (!context) return undefined;
  const exists = await fs
    .access(context.indexPath)
    .then(() => true)
    .catch(() => false);
  const synced = enqueueSync(source, cwd, context);
  if (exists) return context;
  return (await synced) ? context : undefined;
}

async function resolveTaskHistory(
  source: TaskTranscriptSource,
  cwd: string | undefined,
): Promise<TaskHistoryContext | undefined> {
  try {
    // Resolves paths only: the memory directories are left untouched.
    const context = await source.readContext(cwd, { ensure: false });
    if (!context) return undefined;
    const { transcriptDir } = context;
    // Outside the transcripts directory, so no task transcript can collide.
    const indexPath = path.join(path.dirname(transcriptDir), TaskIndexName);
    return { indexPath, transcriptDir };
  } catch (error) {
    logger.warn(`Failed to resolve task history: ${toErrorMessage(error)}`);
    return undefined;
  }
}

/**
 * Syncs of the same index run one after another so a slower, older listing
 * never overwrites a newer one.
 */
function enqueueSync(
  source: TaskTranscriptSource,
  cwd: string | undefined,
  { indexPath }: TaskHistoryContext,
): Promise<boolean> {
  const previous = pendingSyncs.get(indexPath) ?? Promise.resolve(true);
  const next = previous.then(() => writeTaskIndex(source, cwd, indexPath));
  pendingSyncs.set(indexPath, next);
  void next.finally(() => {
    if (pendingSyncs.get(indexPath) === next) {
      pendingSyncs.delete(indexPath);
    }
  });
  return next;
}

/** Resolves whether the index file exists afterwards; never rejects. */
async function writeTaskIndex(
  source: TaskTranscriptSource,
  cwd: string | undefined,
  indexPath: string,
): Promise<boolean> {
  try {
    // Other processes (VS Code windows) sync the same index outside our
    // queue and may replace it with an older listing. Re-list after each
    // write until the file matches: whoever writes last then verifies last,
    // so the final index reflects every transcript.
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
      if (existing === content) return true;
      // Atomic replace, so readers never see a partial file.
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      const tmpPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmpPath, content);
      await fs.rename(tmpPath, indexPath);
    }
    logger.warn("Task index kept changing; leaving the next sync to settle it");
    return true;
  } catch (error) {
    logger.warn(`Failed to write task index: ${toErrorMessage(error)}`);
    return fs
      .access(indexPath)
      .then(() => true)
      .catch(() => false);
  }
}
