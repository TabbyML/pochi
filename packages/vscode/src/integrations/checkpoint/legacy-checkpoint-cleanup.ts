import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getLogger, toErrorMessage } from "@getpochi/common";
import type * as vscode from "vscode";

const logger = getLogger("LegacyCheckpointCleanup");

/** Wait after activation, so the cleanup does not compete with startup work. */
const CleanupDelayMs = 60 * 1000;

/** Set in global state once the checkpoint repositories have been removed. */
const CleanupDoneKey = "pochi.legacyCheckpointCleanup.done";

/** Workspace state keys the removed user edit tracking wrote. */
const UserEditStateKeyPrefix = "pochi.userEditState.branchBaselines";

const CheckpointDirName = "checkpoint";

/** Marker file of the removed orphan checkpoint cleanup. */
const OrphanCleanupMarkerFile = "checkpoint-orphan-cleanup";

export interface LegacyCheckpointCleanupOptions {
  /** VS Code's `User/workspaceStorage` directory. */
  workspaceStorageHome: string;
  /** This extension's global storage directory. */
  globalStorageDir: string;
  /** This extension's id, the name of its directory in workspace storage. */
  extensionId: string;
}

/**
 * Pochi used to snapshot the workspace into a shadow git repository, a
 * checkpoint, before each request. Checkpoints are gone, so deletes every
 * such repository: `<workspaceStorage>/<id>/<extensionId>/checkpoint` and,
 * for workspaces without a VS Code storage id,
 * `<globalStorage>/<hash>/checkpoint`.
 *
 * @returns the deleted checkpoint repositories.
 */
export async function removeLegacyCheckpoints(
  options: LegacyCheckpointCleanupOptions,
): Promise<string[]> {
  const gitPaths = [
    ...(await listSubdirectories(options.workspaceStorageHome)).map(
      (workspaceDir) =>
        path.join(workspaceDir, options.extensionId, CheckpointDirName),
    ),
    ...(await listSubdirectories(options.globalStorageDir)).map((dir) =>
      path.join(dir, CheckpointDirName),
    ),
  ];

  const deleted: string[] = [];
  for (const gitPath of gitPaths) {
    try {
      // Only delete what looks like a git directory.
      if (!(await isFile(path.join(gitPath, "HEAD")))) continue;
      await fs.rm(gitPath, { recursive: true, force: true });
      await removeIfEmpty(path.dirname(gitPath));
      deleted.push(gitPath);
    } catch (error) {
      logger.warn(
        `Failed to delete the checkpoint repository ${gitPath}: ${toErrorMessage(error)}`,
      );
    }
  }

  await fs
    .rm(path.join(options.globalStorageDir, OrphanCleanupMarkerFile), {
      force: true,
    })
    .catch(() => {});

  return deleted;
}

/**
 * Removes the state checkpoints left behind: the user edit baselines of the
 * current workspace, and, once per installation, every checkpoint
 * repository.
 */
export async function runLegacyCheckpointCleanup(
  context: vscode.ExtensionContext,
): Promise<void> {
  for (const key of context.workspaceState.keys()) {
    if (key.startsWith(UserEditStateKeyPrefix)) {
      await context.workspaceState.update(key, undefined);
    }
  }

  if (context.globalState.get<boolean>(CleanupDoneKey)) return;
  const deleted = await removeLegacyCheckpoints({
    workspaceStorageHome: getWorkspaceStorageHome(context),
    globalStorageDir: context.globalStorageUri.fsPath,
    extensionId: context.extension.id,
  });
  await context.globalState.update(CleanupDoneKey, true);
  if (deleted.length > 0) {
    logger.info(`Deleted ${deleted.length} checkpoint repositories.`);
  }
}

/**
 * Runs {@link runLegacyCheckpointCleanup} in the background shortly after
 * activation.
 */
export function scheduleLegacyCheckpointCleanup(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const timer = setTimeout(() => {
    runLegacyCheckpointCleanup(context).catch((error) => {
      logger.warn(
        `Failed to clean up legacy checkpoints: ${toErrorMessage(error)}`,
      );
    });
  }, CleanupDelayMs);
  return { dispose: () => clearTimeout(timer) };
}

function getWorkspaceStorageHome(context: vscode.ExtensionContext): string {
  // globalStorageUri is .../User/globalStorage/<extensionId>.
  const userDir = path.dirname(path.dirname(context.globalStorageUri.fsPath));
  return path.join(userDir, "workspaceStorage");
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

async function isFile(file: string): Promise<boolean> {
  return fs
    .stat(file)
    .then((stat) => stat.isFile())
    .catch(() => false);
}
