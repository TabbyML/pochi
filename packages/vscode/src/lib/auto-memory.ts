import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getMainWorktreePath } from "@/integrations/git/util";
import {
  constants,
  type AutoMemoryContext,
  AutoMemoryIndexName,
  AutoMemoryLockName,
  type AutoMemoryManifestEntry,
  AutoMemoryMaxManifestEntries,
  AutoMemoryTypeValues,
  toErrorMessage,
  truncateAutoMemoryIndex,
} from "@getpochi/common";
import simpleGit from "simple-git";
import { injectable, singleton } from "tsyringe";
import { getLogger } from "./logger";

const logger = getLogger("AutoMemory");
const DefaultIndexContent = `# Memory Index

This file is an index for durable Pochi long-term memory topic files in this directory.
`;
const DreamIntervalMs = 24 * 60 * 60 * 1000;
const DreamSessionThreshold = 5;
const StaleDreamLockMs = 60 * 60 * 1000;

export type AutoMemoryDreamRun = {
  context: AutoMemoryContext;
  token: string;
  previousLastDreamAt: number;
  sessionCount: number;
  reason: "time" | "sessions";
};

type DreamLock = {
  status?: "idle" | "running";
  token?: string;
  pid?: number;
  startedAt?: number;
};

@injectable()
@singleton()
export class AutoMemoryManager {
  /**
   * In-process mutex keyed by `repoKey`. The on-disk lock file synchronizes
   * across processes (different VS Code windows), but two task panels in
   * the same window share this `AutoMemoryManager` singleton — they race
   * each other before either touches the file system. This set serializes
   * concurrent `beginDreamRun` calls for the same repo within one
   * extension host.
   */
  private readonly inFlightRepos = new Set<string>();

  async readContext(
    cwd: string | undefined,
    options?: { ensure?: boolean },
  ): Promise<AutoMemoryContext | undefined> {
    if (!cwd) return undefined;

    const repoRoot = await resolveMainWorktreePath(cwd);
    const repoKey = sanitizeMemoryRepoKey(repoRoot);
    const projectRoot = path.join(os.homedir(), ".pochi", "projects", repoKey);
    const memoryDir = path.join(projectRoot, "memory");
    const transcriptDir = path.join(projectRoot, "transcripts");
    const indexPath = path.join(memoryDir, AutoMemoryIndexName);

    if (options?.ensure !== false) {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(transcriptDir, { recursive: true });
      await ensureIndexFile(indexPath);
    }

    const rawIndexContent = await fs
      .readFile(indexPath, "utf8")
      .catch(() => "");
    const { content: indexContent, truncated: indexTruncated } =
      truncateAutoMemoryIndex(rawIndexContent);
    const manifest = await scanAutoMemoryManifest(memoryDir).catch((error) => {
      logger.warn(
        `Failed to scan long-term memory manifest: ${toErrorMessage(error)}`,
      );
      return [];
    });

    return {
      enabled: true,
      repoKey,
      memoryDir,
      indexPath,
      indexContent,
      indexTruncated,
      manifest,
      transcriptDir,
    };
  }

  /**
   * Persist a per-task transcript file inside the repo's transcripts
   * directory. The owning task panel is the only writer for its own
   * transcript — there is no cross-task store hydration. The file is
   * overwritten each call so transcripts always reflect the latest turn
   * boundary.
   */
  async writeTaskTranscript({
    taskId,
    cwd,
    title,
    updatedAt,
    transcript,
  }: {
    taskId: string;
    cwd: string | undefined;
    title?: string;
    updatedAt?: number;
    transcript: string;
  }): Promise<{ transcriptDir: string; filename: string } | undefined> {
    if (!taskId) return undefined;
    const context = await this.readContext(cwd, { ensure: true });
    if (!context) return undefined;

    const filename = `${sanitizeTaskTranscriptId(taskId)}.md`;
    const filePath = path.join(context.transcriptDir, filename);
    const frontmatter = serializeTranscriptFrontmatter({
      taskId,
      cwd,
      updatedAt: updatedAt ?? Date.now(),
      title,
    });
    const body = transcript.endsWith("\n") ? transcript : `${transcript}\n`;
    try {
      await fs.writeFile(filePath, `${frontmatter}\n${body}`);
    } catch (error) {
      logger.warn(`Failed to write task transcript: ${toErrorMessage(error)}`);
      return undefined;
    }
    return { transcriptDir: context.transcriptDir, filename };
  }

  async beginDreamRun({
    cwd,
    sessionUpdatedAts,
  }: {
    cwd: string | undefined;
    sessionUpdatedAts: readonly number[];
  }): Promise<AutoMemoryDreamRun | undefined> {
    const context = await this.readContext(cwd);
    if (!context) return undefined;

    // Same-process serialization: refuse if another panel in this window
    // is already mid-acquire or holds an active dream for this repo.
    if (this.inFlightRepos.has(context.repoKey)) return undefined;
    this.inFlightRepos.add(context.repoKey);

    try {
      const run = await this.tryAcquireDreamLock(context, sessionUpdatedAts);
      if (!run) {
        // We didn't end up holding the lock — release the in-memory slot
        // so the next eligible turn can try again.
        this.inFlightRepos.delete(context.repoKey);
      }
      return run;
    } catch (error) {
      this.inFlightRepos.delete(context.repoKey);
      throw error;
    }
  }

  /**
   * Cross-process acquisition. Reads the lock, evaluates the gates, writes
   * a new `running` lock with our token, then re-reads and verifies the
   * token round-trips. If two processes raced past the staleness check,
   * the later writer overwrites the earlier — the verify-by-token step
   * lets the loser detect that and bail. Mirrors Claude Code's
   * `tryAcquireConsolidationLock` PID dance, adapted to our token-based
   * lock body.
   */
  private async tryAcquireDreamLock(
    context: AutoMemoryContext,
    sessionUpdatedAts: readonly number[],
  ): Promise<AutoMemoryDreamRun | undefined> {
    const lockPath = path.join(context.memoryDir, AutoMemoryLockName);
    const now = Date.now();
    const existing = await readDreamLock(lockPath);

    if (!existing) {
      await writeDreamLock(lockPath, { status: "idle" }, now);
      return undefined;
    }

    if (
      existing.lock.status === "running" &&
      existing.lock.startedAt &&
      now - existing.lock.startedAt < StaleDreamLockMs
    ) {
      return undefined;
    }

    const previousLastDreamAt = existing.lastDreamAt;
    const sessionCount = sessionUpdatedAts.filter(
      (updatedAt) => updatedAt > previousLastDreamAt,
    ).length;
    const timeDue = now - previousLastDreamAt >= DreamIntervalMs;
    const sessionsDue = sessionCount >= DreamSessionThreshold;
    if (!timeDue && !sessionsDue) return undefined;

    const token = crypto.randomUUID();
    await writeDreamLock(
      lockPath,
      {
        status: "running",
        token,
        pid: process.pid,
        startedAt: now,
      },
      previousLastDreamAt,
    );

    // Verify we won the cross-process race. If another writer's lock body
    // is on disk, the token mismatch tells us we lost — bail without
    // proceeding so the winner has exclusive ownership.
    const verified = await readDreamLock(lockPath);
    if (verified?.lock.token !== token) {
      logger.debug(
        `[AutoMemory] dream lock acquisition lost race for ${context.repoKey}`,
      );
      return undefined;
    }

    return {
      context,
      token,
      previousLastDreamAt,
      sessionCount,
      reason: sessionsDue ? "sessions" : "time",
    };
  }

  async finishDreamRun({
    memoryDir,
    token,
    previousLastDreamAt,
    success,
  }: {
    memoryDir: string;
    token: string;
    previousLastDreamAt: number;
    success: boolean;
  }): Promise<void> {
    const lockPath = path.join(memoryDir, AutoMemoryLockName);
    // Always clear the in-memory mutex for this repo, even if we don't
    // own the on-disk lock anymore (another process took over after a
    // stale-window reclaim). Worst case: a freshly armed dream in this
    // process gets a chance again on the next turn.
    const repoKey = path.basename(path.dirname(memoryDir));
    if (repoKey) this.inFlightRepos.delete(repoKey);

    const existing = await readDreamLock(lockPath);
    if (existing?.lock.status === "running" && existing.lock.token !== token) {
      return;
    }

    await writeDreamLock(
      lockPath,
      { status: "idle" },
      success ? Date.now() : previousLastDreamAt,
    );
  }
}

export async function resolveMainWorktreePath(cwd: string): Promise<string> {
  const resolvedCwd = path.resolve(cwd);
  const mainWorktreePath = await getMainWorktreePath(resolvedCwd);
  if (mainWorktreePath) return path.resolve(mainWorktreePath);

  try {
    const git = simpleGit(resolvedCwd, {
      timeout: { block: constants.GitOperationTimeoutMs },
    });
    const root = (await git.revparse(["--show-toplevel"])).trim();
    const mainRoot = await getMainWorktreePath(root);
    return path.resolve(mainRoot ?? root);
  } catch {
    return resolvedCwd;
  }
}

/**
 * Maximum length of the human-readable basename portion of a repo key.
 * Keeps directory listings tidy without growing unbounded for very deep
 * project paths or pathological folder names.
 */
const MaxRepoKeySlugLength = 32;

/**
 * Build a short, stable identifier for the repository at `repoPath`.
 *
 * Format: `<basename-slug>-<hash>` where:
 * - `basename-slug` is the project's directory basename, sanitized to
 *   filesystem-safe characters and capped at {@link MaxRepoKeySlugLength}.
 *   This keeps the key human-recognizable in directory listings.
 * - `hash` is the first 10 hex chars of sha256(normalizedAbsolutePath),
 *   guaranteeing global uniqueness even when two unrelated worktrees
 *   share the same basename (e.g. `~/work/pochi` vs `~/oss/pochi`).
 *
 * Example: `/Users/me/oss/github.com/TabbyML/pochi` → `pochi-a1b2c3d4e5`.
 */
export function sanitizeMemoryRepoKey(repoPath: string): string {
  const normalized = path.resolve(repoPath).replace(/\\/g, "/");
  const basename = path.basename(normalized);
  const slug =
    basename
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MaxRepoKeySlugLength) || "repo";
  const hash = crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 10);
  return `${slug}-${hash}`;
}

async function ensureIndexFile(indexPath: string): Promise<void> {
  await fs
    .writeFile(indexPath, DefaultIndexContent, { flag: "wx" })
    .catch((error) => {
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "EEXIST") return;
      }
      throw error;
    });
}

async function scanAutoMemoryManifest(
  memoryDir: string,
): Promise<AutoMemoryManifestEntry[]> {
  const entries = await fs.readdir(memoryDir, { withFileTypes: true });
  const manifest = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".md") &&
          entry.name !== AutoMemoryIndexName,
      )
      .map(async (entry) => {
        const filePath = path.join(memoryDir, entry.name);
        const [stat, content] = await Promise.all([
          fs.stat(filePath),
          fs.readFile(filePath, "utf8").catch(() => ""),
        ]);
        return {
          filename: entry.name,
          updatedAt: stat.mtimeMs,
          ...parseTopicFrontmatter(content),
        };
      }),
  );

  return manifest
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, AutoMemoryMaxManifestEntries);
}

function parseTopicFrontmatter(
  content: string,
): Omit<AutoMemoryManifestEntry, "filename" | "updatedAt"> {
  const header = content.split(/\r?\n/).slice(0, 30).join("\n");
  const match = header.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    data[pair[1]] = pair[2].replace(/^["']|["']$/g, "").trim();
  }

  const type = AutoMemoryTypeValues.find((value) => value === data.type);
  return {
    name: data.name || undefined,
    description: data.description || undefined,
    type,
  };
}

async function readDreamLock(
  lockPath: string,
): Promise<{ lock: DreamLock; lastDreamAt: number } | undefined> {
  try {
    const [stat, content] = await Promise.all([
      fs.stat(lockPath),
      fs.readFile(lockPath, "utf8"),
    ]);
    return {
      lock: JSON.parse(content || "{}"),
      lastDreamAt: stat.mtimeMs,
    };
  } catch {
    return undefined;
  }
}

async function writeDreamLock(
  lockPath: string,
  lock: DreamLock,
  mtimeMs: number,
): Promise<void> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, `${JSON.stringify(lock)}\n`);
  const seconds = mtimeMs / 1000;
  await fs.utimes(lockPath, seconds, seconds);
}

/**
 * Best-effort cleanup of orphaned transcript files for a set of removed
 * task IDs. Walks every project's transcripts directory under
 * `~/.pochi/projects/&#42;/transcripts/<taskId>.md` and removes matches.
 * Errors are swallowed — transcripts are derived data and lingering files
 * are harmless.
 */
export async function removeTaskTranscripts(
  taskIds: readonly string[],
): Promise<void> {
  if (taskIds.length === 0) return;
  const projectsRoot = path.join(os.homedir(), ".pochi", "projects");
  const sanitized = taskIds.map((id) => sanitizeTaskTranscriptId(id));
  let projectEntries: string[] = [];
  try {
    projectEntries = await fs.readdir(projectsRoot);
  } catch {
    return;
  }

  await Promise.all(
    projectEntries.flatMap((projectKey) =>
      sanitized.map((id) =>
        fs
          .rm(path.join(projectsRoot, projectKey, "transcripts", `${id}.md`), {
            force: true,
          })
          .catch(() => undefined),
      ),
    ),
  );
}

function sanitizeTaskTranscriptId(taskId: string): string {
  // Allow safe characters only — taskIds are UUIDs in practice but we
  // still defend against accidental path separators.
  return taskId.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function serializeTranscriptFrontmatter({
  taskId,
  cwd,
  updatedAt,
  title,
}: {
  taskId: string;
  cwd: string | undefined;
  updatedAt: number;
  title?: string;
}): string {
  const lines = [
    "---",
    `taskId: ${taskId}`,
    `cwd: ${cwd ? quoteYamlString(cwd) : "(unknown)"}`,
    `updatedAt: ${new Date(updatedAt).toISOString()}`,
  ];
  if (title) {
    lines.push(`title: ${quoteYamlString(title)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function quoteYamlString(value: string): string {
  // Always single-quote and escape internal single quotes — covers paths
  // containing spaces or YAML special characters cleanly.
  return `'${value.replace(/'/g, "''")}'`;
}
