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
  async readContext(
    cwd: string | undefined,
    options?: { ensure?: boolean },
  ): Promise<AutoMemoryContext | undefined> {
    if (!cwd) return undefined;

    const repoRoot = await resolveMainWorktreePath(cwd);
    const repoKey = sanitizeMemoryRepoKey(repoRoot);
    const memoryDir = path.join(
      os.homedir(),
      ".pochi",
      "projects",
      repoKey,
      "memory",
    );
    const indexPath = path.join(memoryDir, AutoMemoryIndexName);

    if (options?.ensure !== false) {
      await fs.mkdir(memoryDir, { recursive: true });
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
    };
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

export function sanitizeMemoryRepoKey(repoPath: string): string {
  const normalized = path.resolve(repoPath).replace(/\\/g, "/");
  const slug = normalized
    .replace(/^([A-Za-z]):/, "$1")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-90);
  const hash = crypto
    .createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 10);
  return `${slug || "repo"}-${hash}`;
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
