import fs from "node:fs/promises";
import path from "node:path";
import simpleGit from "simple-git";
import { constants, getLogger, toErrorMessage } from "../base";

const logger = getLogger("WorktreeInclude");

/**
 * Copies gitignored files matching .worktreeinclude patterns from the main
 * worktree into the new worktree (e.g. .env, local config files).
 */
export async function copyWorktreeIncludeFiles(
  mainWorktreePath: string,
  newWorktreePath: string,
): Promise<void> {
  const includeFilePath = path.join(mainWorktreePath, ".worktreeinclude");

  try {
    await fs.access(includeFilePath);
  } catch {
    return; // no .worktreeinclude – nothing to do
  }

  const git = simpleGit(mainWorktreePath, {
    timeout: { block: constants.GitOperationTimeoutMs },
  });

  let rawOutput: string;
  try {
    rawOutput = await git.raw([
      "ls-files",
      "--others",
      "--ignored",
      `--exclude-from=${includeFilePath}`,
    ]);
  } catch (error) {
    logger.warn(
      `Failed to list .worktreeinclude files: ${toErrorMessage(error)}`,
    );
    return;
  }

  const relativeFiles = rawOutput
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  if (relativeFiles.length === 0) {
    return;
  }

  logger.debug(
    `Copying ${relativeFiles.length} .worktreeinclude file(s) to new worktree`,
  );

  for (const relativePath of relativeFiles) {
    const src = path.join(mainWorktreePath, relativePath);
    const dest = path.join(newWorktreePath, relativePath);
    try {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    } catch (error) {
      logger.warn(`Failed to copy ${relativePath}: ${toErrorMessage(error)}`);
    }
  }
}
