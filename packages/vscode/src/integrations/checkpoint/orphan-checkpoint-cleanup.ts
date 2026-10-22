import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { constants, getLogger, toErrorMessage } from "@getpochi/common";
import simpleGit from "simple-git";
import * as vscode from "vscode";
import { getWorkspaceStorageHome } from "./util";

const logger = getLogger("OrphanCheckpointCleanup");

/** Repositories untouched for this long, whose folder is gone, are deleted. */
const OrphanRetentionMs = 90 * 24 * 60 * 60 * 1000;

/** How often to look for orphaned repositories. */
const CleanupIntervalMs = 24 * 60 * 60 * 1000;

/** Wait after activation, so the cleanup does not compete with startup work. */
const CleanupDelayMs = 60 * 1000;

const CheckpointDirName = "checkpoint";
const LastRunMarkerFile = "checkpoint-orphan-cleanup";

/** Files git or Pochi write whenever a checkpoint repository is used. */
const ActivityFiles = [
  "HEAD",
  "index",
  "packed-refs",
  "logs/HEAD",
  "info/exclude",
  "pochi-last-prune",
];

/** Directories that hold mounted volumes, which may be absent for a while. */
const VolumeRoots = ["/Volumes", "/media", "/mnt", "/run/media"];

export interface OrphanCheckpointCleanupOptions {
  /** VS Code's `User/workspaceStorage` directory. */
  workspaceStorageHome: string;
  /** This extension's global storage directory. */
  globalStorageDir: string;
  /** This extension's id, the name of its directory in workspace storage. */
  extensionId: string;
  retentionMs: number;
  intervalMs: number;
}

/**
 * Checkpoints live in a storage directory derived from the workspace folder.
 * When the folder is deleted, moved or cloned again, nothing opens its
 * checkpoint repository anymore, so the repository is never pruned. Deletes
 * such repositories once they have been untouched for `retentionMs`.
 *
 * @returns the deleted checkpoint repositories.
 */
export async function cleanupOrphanCheckpoints(
  options: OrphanCheckpointCleanupOptions,
): Promise<string[]> {
  const markerFile = path.join(options.globalStorageDir, LastRunMarkerFile);
  const lastRunAt = await fs
    .stat(markerFile)
    .then((stat) => stat.mtimeMs)
    .catch(() => 0);
  if (Date.now() - lastRunAt < options.intervalMs) {
    return [];
  }
  await fs.mkdir(options.globalStorageDir, { recursive: true });
  await fs.writeFile(markerFile, "");

  const repos = [
    ...(await listSubdirectories(options.workspaceStorageHome)).map(
      (workspaceDir) => ({
        workspaceDir,
        gitPath: path.join(
          workspaceDir,
          options.extensionId,
          CheckpointDirName,
        ),
      }),
    ),
    // Workspaces without a VS Code storage id fall back to global storage.
    ...(await listSubdirectories(options.globalStorageDir)).map((dir) => ({
      workspaceDir: undefined,
      gitPath: path.join(dir, CheckpointDirName),
    })),
  ];

  const deleted: string[] = [];
  const cutoff = Date.now() - options.retentionMs;
  for (const { workspaceDir, gitPath } of repos) {
    try {
      if (!(await isFile(path.join(gitPath, "HEAD")))) continue;
      const folder = await findWorkspaceFolder(workspaceDir, gitPath);
      if (!folder || isOnMissingVolume(folder) || (await exists(folder))) {
        continue;
      }
      if ((await getLastActivity(gitPath)) > cutoff) continue;

      await fs.rm(gitPath, { recursive: true, force: true });
      await removeIfEmpty(path.dirname(gitPath));
      deleted.push(gitPath);
      logger.info(
        `Deleted the checkpoint repository ${gitPath} of the missing folder ${folder}.`,
      );
    } catch (error) {
      logger.warn(
        `Failed to clean up the checkpoint repository ${gitPath}: ${toErrorMessage(error)}`,
      );
    }
  }
  return deleted;
}

/**
 * Runs {@link cleanupOrphanCheckpoints} in the background shortly after
 * activation.
 */
export function scheduleOrphanCheckpointCleanup(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const timer = setTimeout(() => {
    cleanupOrphanCheckpoints({
      workspaceStorageHome: getWorkspaceStorageHome(context),
      globalStorageDir: context.globalStorageUri.fsPath,
      extensionId: context.extension.id,
      retentionMs: OrphanRetentionMs,
      intervalMs: CleanupIntervalMs,
    }).catch((error) => {
      logger.warn(
        `Failed to clean up orphaned checkpoints: ${toErrorMessage(error)}`,
      );
    });
  }, CleanupDelayMs);
  return { dispose: () => clearTimeout(timer) };
}

/**
 * Returns the local folder a checkpoint repository belongs to, or undefined
 * when it cannot be told.
 */
async function findWorkspaceFolder(
  workspaceDir: string | undefined,
  gitPath: string,
): Promise<string | undefined> {
  // VS Code records the folder of each workspace storage directory. Prefer it
  // over core.worktree, which names the last worktree that opened the
  // repository, possibly a deleted linked worktree of a folder still in use.
  if (workspaceDir) {
    const workspaceFile = path.join(workspaceDir, "workspace.json");
    const content = await fs.readFile(workspaceFile, "utf8").catch(() => null);
    if (content !== null) {
      const folder = (JSON.parse(content) as { folder?: unknown }).folder;
      if (typeof folder !== "string") return undefined;
      const uri = vscode.Uri.parse(folder);
      // Remote folders cannot be checked from here.
      return uri.scheme === "file" ? uri.fsPath : undefined;
    }
  }
  try {
    const worktree = await simpleGit({
      timeout: { block: constants.GitOperationTimeoutMs },
    }).raw([
      "config",
      "--file",
      path.join(gitPath, "config"),
      "--get",
      "core.worktree",
    ]);
    return worktree.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Whether the volume holding `folder` is not mounted. */
function isOnMissingVolume(folder: string): boolean {
  if (process.platform === "win32") {
    return !existsSync(path.parse(folder).root);
  }
  for (const root of VolumeRoots) {
    if (folder.startsWith(`${root}/`)) {
      const volume = folder.slice(root.length + 1).split("/")[0];
      return !existsSync(path.join(root, volume));
    }
  }
  return false;
}

async function getLastActivity(gitPath: string): Promise<number> {
  const refsDir = path.join(gitPath, "refs", "heads");
  const refs = (await fs.readdir(refsDir).catch(() => [])).map((name) =>
    path.join("refs", "heads", name),
  );
  const mtimes = await Promise.all(
    [...ActivityFiles, ...refs].map((file) =>
      fs
        .stat(path.join(gitPath, file))
        .then((stat) => stat.mtimeMs)
        .catch(() => 0),
    ),
  );
  return Math.max(...mtimes);
}

async function listSubdirectories(dir: string): Promise<string[]> {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}

async function removeIfEmpty(dir: string) {
  if ((await fs.readdir(dir)).length === 0) {
    await fs.rmdir(dir);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch (error) {
    // Only a missing file counts; on other errors, such as a denied
    // permission, assume the folder is still there.
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

async function isFile(file: string): Promise<boolean> {
  return fs
    .stat(file)
    .then((stat) => stat.isFile())
    .catch(() => false);
}
