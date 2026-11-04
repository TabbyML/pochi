import fs from "node:fs/promises";
import path from "node:path";
import type { AutoMemoryManager } from "../auto-memory/node";
import { listTranscriptCandidates } from "../auto-memory/transcripts";
import {
  type TaskHistoryContext,
  TaskIndexName,
  getLogger,
  renderTaskIndex,
  toErrorMessage,
} from "../base";

const logger = getLogger("TaskHistory");

const pendingSyncs = new Map<string, Promise<boolean>>();
const MaxSyncAttempts = 5;

/**
 * Like {@link syncTaskIndex}, but does not wait for the transcript scan when
 * an index already exists: it is refreshed in the background instead.
 */
export async function readTaskIndex(
  source: Pick<AutoMemoryManager, "resolveProjectPaths">,
  cwd: string | undefined,
): Promise<TaskHistoryContext | undefined> {
  if (!cwd) return undefined;
  try {
    const { transcriptDir } = await source.resolveProjectPaths(cwd);
    const context = { transcriptDir, indexPath: taskIndexPath(transcriptDir) };
    const exists = await fs
      .access(context.indexPath)
      .then(() => true)
      .catch(() => false);
    const synced = syncTaskIndex(transcriptDir);
    if (exists) return context;
    return (await synced) ? context : undefined;
  } catch (error) {
    logger.warn(`Failed to resolve task history: ${toErrorMessage(error)}`);
    return undefined;
  }
}

function taskIndexPath(transcriptDir: string) {
  return path.join(path.dirname(transcriptDir), TaskIndexName);
}

/**
 * Syncs of the same index run one after another so a slower, older listing
 * never overwrites a newer one.
 */
export function syncTaskIndex(transcriptDir: string): Promise<boolean> {
  const previous = pendingSyncs.get(transcriptDir) ?? Promise.resolve(true);
  const next = previous.then(() => writeTaskIndex(transcriptDir));
  pendingSyncs.set(transcriptDir, next);
  void next.finally(() => {
    if (pendingSyncs.get(transcriptDir) === next) {
      pendingSyncs.delete(transcriptDir);
    }
  });
  return next;
}

/** Resolves whether the index file exists afterwards; never rejects. */
async function writeTaskIndex(transcriptDir: string): Promise<boolean> {
  const indexPath = taskIndexPath(transcriptDir);
  try {
    // Other processes (VS Code windows) sync the same index outside our
    // queue and may replace it with an older listing. Re-list after each
    // write until the file matches: whoever writes last then verifies last,
    // so the final index reflects every transcript.
    for (let attempt = 0; attempt < MaxSyncAttempts; attempt++) {
      const transcripts = await listTranscriptCandidates(transcriptDir, {
        requireComplete: true,
      });
      const content = renderTaskIndex(transcripts);
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
