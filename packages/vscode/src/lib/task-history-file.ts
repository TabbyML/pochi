import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type EncodedTask = {
  id: string;
  parentId: string | null;
  shareId: string | null;
  // unix timestamp in milliseconds
  updatedAt: number;
  cwd?: string | null;
  title?: string | null;
  // JSON encoded `TaskError`. Kept small on purpose, see `sanitizeTask`.
  error?: string | null;
  // Used to scope tasks to the current repository.
  git?: {
    worktree?: { gitdir?: string } | null;
  } | null;
};

const MaxEncodedTaskErrorChars = 8 * 1024;

/** The JSON file is a cache. Only LiveStore updates, never cached snapshots,
 * may replace an existing row. Atomic replacement protects file integrity,
 * but does not serialize simultaneous updates from different windows. */
export class TaskHistoryFile {
  constructor(private readonly filePath: string) {}

  update(
    updates: Record<string, EncodedTask>,
    evictions: Record<string, EncodedTask>,
  ) {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tasks = this.read();
    const evicted: string[] = [];
    for (const [id, expected] of Object.entries(evictions)) {
      // A different window may have refreshed this cache entry meanwhile.
      if (
        !(id in updates) &&
        JSON.stringify(tasks[id]) === JSON.stringify(expected)
      ) {
        delete tasks[id];
        evicted.push(id);
      }
    }
    Object.assign(tasks, updates);
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp.json`;
    try {
      writeFileSync(tempPath, JSON.stringify(tasks));
      renameSync(tempPath, this.filePath);
    } finally {
      // Cleanup failure must not turn a successful publication into a retry
      // that could overwrite a subsequent update from another window.
      try {
        rmSync(tempPath, { force: true });
      } catch {}
    }
    return { tasks, evicted };
  }

  read(): Record<string, EncodedTask> {
    let content: string;
    try {
      content = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if (hasCode(error, "ENOENT")) return {};
      throw error;
    }
    try {
      return Object.fromEntries(
        Object.entries(parseTasks(content)).map(([id, task]) => [
          id,
          sanitizeTask(task),
        ]),
      );
    } catch {
      // A failed backup aborts the operation; never overwrite the only copy.
      renameSync(
        this.filePath,
        `${this.filePath.replace(/\.json$/, "")}.corrupted-${Date.now()}-${randomUUID()}.json`,
      );
      return {};
    }
  }
}

function hasCode(error: unknown, code: string): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}

function parseTasks(content: string): Record<string, EncodedTask> {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Task history is not an object");
  }
  const tasks: Record<string, EncodedTask> = {};
  for (const [id, task] of Object.entries(parsed as Record<string, unknown>)) {
    if (!task || typeof task !== "object") continue;
    tasks[id] = task as EncodedTask;
  }
  return tasks;
}

export function sanitizeTask(task: EncodedTask): EncodedTask {
  const { error } = task;
  if (typeof error !== "string" || error.length <= MaxEncodedTaskErrorChars) {
    return task;
  }
  return { ...task, error: summarizeEncodedTaskError(error) };
}

/**
 * Replaces an oversized encoded `TaskError` with an equivalent that still
 * decodes against the `TaskError` schema.
 */
function summarizeEncodedTaskError(encoded: string): string {
  const message = `Error details dropped (${encoded.length} characters).`;
  try {
    const parsed = JSON.parse(encoded) as Record<string, unknown>;
    if (parsed.kind === "APICallError") {
      return JSON.stringify({
        kind: "APICallError",
        isRetryable: parsed.isRetryable === true,
        message: truncate(parsed.message, message),
        requestBodyValues: {
          omitted: "requestBodyValues too large",
          size: encoded.length,
        },
      });
    }
    return JSON.stringify({
      kind: parsed.kind === "AbortError" ? "AbortError" : "InternalError",
      message: truncate(parsed.message, message),
    });
  } catch {
    return JSON.stringify({ kind: "InternalError", message });
  }
}

function truncate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (value.length <= 4_000) return value;
  return `${value.slice(0, 4_000)}… [truncated]`;
}
