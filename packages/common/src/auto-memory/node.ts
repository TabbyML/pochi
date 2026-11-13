import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import simpleGit from "simple-git";
import {
  constants,
  type AutoMemoryContext,
  type AutoMemoryDreamCandidate,
  type AutoMemoryDreamRun,
  AutoMemoryIndexName,
  AutoMemoryLockName,
  type AutoMemoryManifestEntry,
  AutoMemoryProjectInfoName,
  type AutoMemoryReadContextOptions,
  type AutoMemoryTranscriptEntry,
  AutoMemoryTypeValues,
  getLogger,
  getSubagentTranscriptPath,
  renderAutoMemoryIndex,
  toErrorMessage,
  truncateAutoMemoryIndex,
} from "../base";
import { syncTaskIndex } from "../task-history/node";
import { parseMarkdownWithFrontmatter } from "../tool-utils/markdown-frontmatter";
import { listTranscriptCandidates } from "./transcripts";

const logger = getLogger("AutoMemory");
const DreamIntervalMs = 24 * 60 * 60 * 1000;
const DreamSessionThreshold = 5;
const StaleDreamLockMs = 60 * 60 * 1000;

export type AutoMemoryManagerOptions = {
  projectsRoot?: string;
};

type DreamLock = {
  status?: "idle" | "running";
  token?: string;
  pid?: number;
  startedAt?: number;
};

type AcquiredDreamRun = Omit<AutoMemoryDreamRun, "candidates">;

export class AutoMemoryManager {
  private readonly inFlightRepos = new Set<string>();
  private readonly projectsRoot: string;

  constructor(options: AutoMemoryManagerOptions = {}) {
    this.projectsRoot =
      options.projectsRoot ?? path.join(os.homedir(), ".pochi", "projects");
  }

  async resolveProjectPaths(cwd: string) {
    const unresolvedRoot = await findMainWorktreePath(cwd);
    const repoRoot = await realpathOrSelf(unresolvedRoot);
    const repoKey = sanitizeMemoryRepoKey(repoRoot);
    const projectRoot = path.join(this.projectsRoot, repoKey);
    if (unresolvedRoot !== repoRoot) {
      await adoptLegacyProjectRoot(
        path.join(this.projectsRoot, sanitizeMemoryRepoKey(unresolvedRoot)),
        projectRoot,
      );
    }
    return {
      repoRoot,
      repoKey,
      projectRoot,
      transcriptDir: path.join(projectRoot, "transcripts"),
    };
  }

  async readContext(
    cwdOrOptions: string | AutoMemoryReadContextOptions | undefined,
    legacyOptions?: { ensure?: boolean },
  ): Promise<AutoMemoryContext | undefined> {
    const options =
      typeof cwdOrOptions === "string" || legacyOptions
        ? { cwd: cwdOrOptions as string | undefined, ...legacyOptions }
        : cwdOrOptions;
    const cwd = options?.cwd;
    if (!cwd) return undefined;

    const { repoRoot, repoKey, projectRoot, transcriptDir } =
      await this.resolveProjectPaths(cwd);
    const memoryDir = path.join(projectRoot, "memory");
    const indexPath = path.join(memoryDir, AutoMemoryIndexName);

    if (options?.ensure !== false) {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.mkdir(transcriptDir, { recursive: true });
      await writeProjectInfoFile({ projectRoot, repoKey, repoRoot }).catch(
        (error) => {
          logger.warn(
            `Failed to update project info file: ${toErrorMessage(error)}`,
          );
        },
      );
    }

    const manifest = await scanAutoMemoryManifest(memoryDir).catch((error) => {
      logger.warn(
        `Failed to scan long-term memory manifest: ${toErrorMessage(error)}`,
      );
      return [];
    });

    // MEMORY.md is a derived artifact: it is rendered from topic-file
    // frontmatter instead of being written by the memory agents, so a topic
    // file can never end up missing from the index, and per-turn extraction
    // saves the index write entirely.
    const generatedIndex = renderAutoMemoryIndex(manifest);
    if (options?.ensure !== false) {
      await syncIndexFile(indexPath, generatedIndex);
    }
    const { content: indexContent, truncated: indexTruncated } =
      truncateAutoMemoryIndex(generatedIndex);

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

  async writeTaskTranscript({
    taskId,
    cwd,
    title,
    status,
    updatedAt,
    transcript,
  }: {
    taskId: string;
    cwd?: string;
    title?: string;
    status?: string;
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
      status,
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

  /**
   * Lists the task transcripts of the repo containing `cwd`, newest first.
   * Never creates directories; a missing transcript directory yields `[]`.
   */
  async listTranscripts({
    cwd,
    excludeTaskId,
  }: {
    cwd?: string;
    excludeTaskId?: string;
  }): Promise<AutoMemoryTranscriptEntry[]> {
    if (!cwd) return [];
    // Resolve the transcript directory directly: `readContext` also parses
    // every memory topic file, which is slow and not needed here.
    const { transcriptDir } = await this.resolveProjectPaths(cwd);

    let candidates: AutoMemoryDreamCandidate[];
    try {
      candidates = await listTranscriptCandidates(transcriptDir);
    } catch {
      return [];
    }
    return candidates
      .filter((candidate) => candidate.taskId !== excludeTaskId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((candidate) => ({
        taskId: candidate.taskId,
        title: candidate.title,
        updatedAt: candidate.updatedAt,
        filePath: path.join(transcriptDir, candidate.transcriptFilename),
      }));
  }

  async beginDreamRun({
    cwd,
    currentTaskId,
  }: {
    cwd?: string;
    currentTaskId?: string;
  }): Promise<AutoMemoryDreamRun | undefined> {
    const context = await this.readContext(cwd);
    if (!context) return undefined;

    if (this.inFlightRepos.has(context.repoKey)) return undefined;
    this.inFlightRepos.add(context.repoKey);

    try {
      // Discover actual source files, including sessions from other clients or
      // worktrees. Task history alone does not guarantee a transcript exists.
      const dreamCandidates = (
        await listTranscriptCandidates(context.transcriptDir)
      ).filter((candidate) => candidate.taskId !== currentTaskId);
      const updatedAts = dreamCandidates.map(
        (candidate) => candidate.updatedAt,
      );
      const run = await this.tryAcquireDreamLock(context, updatedAts);
      if (!run) {
        this.inFlightRepos.delete(context.repoKey);
        return undefined;
      }
      return {
        ...run,
        candidates: dreamCandidates
          .filter((candidate) => candidate.updatedAt > run.previousLastDreamAt)
          .sort((a, b) => b.updatedAt - a.updatedAt),
      };
    } catch (error) {
      this.inFlightRepos.delete(context.repoKey);
      throw error;
    }
  }

  private async tryAcquireDreamLock(
    context: AutoMemoryContext,
    sessionUpdatedAts: readonly number[],
  ): Promise<AcquiredDreamRun | undefined> {
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
    if (!timeDue || !sessionsDue) return undefined;

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

  async clearProjectMemory({ cwd }: { cwd?: string } = {}): Promise<void> {
    const context = await this.readContext(cwd, { ensure: false });
    if (!context) return;

    const exists = await fs
      .stat(context.memoryDir)
      .then(() => true)
      .catch(() => false);
    if (!exists) return;

    const entries = await fs.readdir(context.memoryDir).catch(() => []);
    await Promise.all(
      entries
        .filter(
          (entry) => entry.endsWith(".md") || entry === AutoMemoryLockName,
        )
        .map((entry) =>
          fs.rm(path.join(context.memoryDir, entry), { force: true }),
        ),
    );
    // Re-create the (now empty) generated index so the memory dir stays usable.
    await syncIndexFile(context.indexPath, renderAutoMemoryIndex([]));
  }
}

/**
 * The main worktree of the repo containing `cwd`, with symlinks resolved, so
 * a repo opened through a symlinked path (e.g. /tmp -> /private/tmp on macOS)
 * maps to the same project as its other worktrees, whose paths git records
 * in resolved form.
 */
export async function resolveMainWorktreePath(cwd: string): Promise<string> {
  return realpathOrSelf(await findMainWorktreePath(cwd));
}

async function realpathOrSelf(filePath: string): Promise<string> {
  return fs.realpath(filePath).catch(() => filePath);
}

/**
 * Project keys used to be computed from the unresolved path, so a repo opened
 * through a symlink got a second project directory. Move it to the resolved
 * key unless that directory already exists; then the old one is left as is.
 */
async function adoptLegacyProjectRoot(
  legacyRoot: string,
  projectRoot: string,
): Promise<void> {
  if (legacyRoot === projectRoot) return;
  const exists = await fs
    .access(projectRoot)
    .then(() => true)
    .catch(() => false);
  if (exists) return;
  try {
    await fs.rename(legacyRoot, projectRoot);
    logger.info(`Moved project directory ${legacyRoot} to ${projectRoot}`);
  } catch {
    // No legacy directory, or another window moved it first.
  }
}

async function findMainWorktreePath(cwd: string): Promise<string> {
  const resolvedCwd = path.resolve(cwd);
  const mainWorktreePath = await readGitFileMainWorktreePath(resolvedCwd);
  if (mainWorktreePath) return path.resolve(mainWorktreePath);

  try {
    const git = simpleGit(resolvedCwd, {
      timeout: { block: constants.GitOperationTimeoutMs },
    });
    const root = (await git.revparse(["--show-toplevel"])).trim();
    const mainRoot = await readGitFileMainWorktreePath(root);
    return path.resolve(mainRoot ?? root);
  } catch {
    return resolvedCwd;
  }
}

async function readGitFileMainWorktreePath(
  worktreeRoot: string,
): Promise<string | undefined> {
  const gitPath = path.join(worktreeRoot, ".git");
  try {
    const stat = await fs.stat(gitPath);
    if (stat.isDirectory()) return worktreeRoot;
    if (!stat.isFile()) return undefined;

    const content = await fs.readFile(gitPath, "utf8");
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) return undefined;

    const gitDir = path.resolve(worktreeRoot, match[1].trim());
    if (path.basename(path.dirname(gitDir)) !== "worktrees") {
      return undefined;
    }

    return path.dirname(path.dirname(path.dirname(gitDir)));
  } catch {
    return undefined;
  }
}

const MaxRepoKeySlugLength = 32;

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

/**
 * Writes a background subagent's transcript at
 * {@link getSubagentTranscriptPath}. It stays out of the project transcripts,
 * so it never enters the task index or long-term memory.
 */
export async function writeSubagentTranscript(
  {
    parentTaskId,
    taskId,
    cwd,
    title,
    status,
    updatedAt,
    transcript,
  }: {
    parentTaskId: string;
    taskId: string;
    cwd?: string;
    title?: string;
    status?: string;
    updatedAt?: number;
    transcript: string;
  },
  homeDir = os.homedir(),
): Promise<void> {
  const filePath = getSubagentTranscriptPath(homeDir, parentTaskId, taskId);
  const frontmatter = serializeTranscriptFrontmatter({
    taskId,
    cwd,
    updatedAt: updatedAt ?? Date.now(),
    status,
    title,
  });
  const body = transcript.endsWith("\n") ? transcript : `${transcript}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${frontmatter}\n${body}`);
}

export async function removeTaskTranscripts(
  taskIds: readonly string[],
  options?: { projectsRoot?: string },
): Promise<void> {
  if (taskIds.length === 0) return;
  const projectsRoot =
    options?.projectsRoot ?? path.join(os.homedir(), ".pochi", "projects");
  const sanitized = taskIds.map((id) => sanitizeTaskTranscriptId(id));
  let projectEntries: string[] = [];
  try {
    projectEntries = await fs.readdir(projectsRoot);
  } catch {
    return;
  }

  await Promise.all(
    projectEntries.map(async (projectKey) => {
      const transcriptDir = path.join(projectsRoot, projectKey, "transcripts");
      const removed = await Promise.allSettled(
        sanitized.map((id) => fs.unlink(path.join(transcriptDir, `${id}.md`))),
      );
      if (removed.some((result) => result.status === "fulfilled")) {
        await syncTaskIndex(transcriptDir);
      }
    }),
  );
}

/** Persist the generated index, skipping the write when nothing changed. */
async function syncIndexFile(
  indexPath: string,
  content: string,
): Promise<void> {
  try {
    const existing = await fs
      .readFile(indexPath, "utf8")
      .catch(() => undefined);
    if (existing === content) return;
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(indexPath, content);
  } catch (error) {
    logger.warn(
      `Failed to write long-term memory index: ${toErrorMessage(error)}`,
    );
  }
}

type ProjectInfoFile = {
  repoKey: string;
  repoPath: string;
};

async function writeProjectInfoFile({
  projectRoot,
  repoKey,
  repoRoot,
}: {
  projectRoot: string;
  repoKey: string;
  repoRoot: string;
}): Promise<void> {
  const filePath = path.join(projectRoot, AutoMemoryProjectInfoName);
  try {
    const existing = await fs.readFile(filePath, "utf8");
    const parsed: Partial<ProjectInfoFile> = JSON.parse(existing);
    if (parsed.repoKey === repoKey && parsed.repoPath === repoRoot) {
      return;
    }
  } catch {}

  const info: ProjectInfoFile = { repoKey, repoPath: repoRoot };
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(info, null, 2)}\n`);
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
          ...(await parseTopicFrontmatter(filePath, content)),
        };
      }),
  );

  // Keep the full set for the on-disk index. Only prompt rendering is capped.
  return manifest.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

async function parseTopicFrontmatter(
  filePath: string,
  content: string,
): Promise<Omit<AutoMemoryManifestEntry, "filename" | "updatedAt">> {
  const parsed = await parseMarkdownWithFrontmatter(
    filePath,
    async () => content,
  );
  if (!parsed.ok) return {};

  const data = parsed.frontmatter;
  const type = AutoMemoryTypeValues.find((value) => value === data.type);
  return {
    name: normalizeTopicMetadata(data.name),
    description: normalizeTopicMetadata(data.description),
    type,
  };
}

function normalizeTopicMetadata(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/\s+/g, " ").trim() || undefined;
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

function sanitizeTaskTranscriptId(taskId: string): string {
  return taskId.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function serializeTranscriptFrontmatter({
  taskId,
  cwd,
  updatedAt,
  status,
  title,
}: {
  taskId: string;
  cwd: string | undefined;
  updatedAt: number;
  status?: string;
  title?: string;
}): string {
  const lines = [
    "---",
    `taskId: ${taskId}`,
    `cwd: ${cwd ? quoteYamlString(cwd) : "(unknown)"}`,
    `updatedAt: ${new Date(updatedAt).toISOString()}`,
  ];
  if (status) {
    lines.push(`status: ${quoteYamlString(status)}`);
  }
  if (title) {
    lines.push(`title: ${quoteYamlString(title)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function quoteYamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
