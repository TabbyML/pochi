import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Ignore } from "ignore";
import ignore from "ignore";
import { getLogger } from "../base";

const logger = getLogger("ignoreWalk");
const MaxScanItems = 10_000;

export interface FileResult {
  filepath: string;
  isDir: boolean;
  relativePath: string;
}

/**
 * Attempts to load and parse .gitignore rules from the specified directory
 * @param directoryPath Path to directory that may contain a .gitignore file
 * @returns Array of parsed .gitignore rules (empty if file not found)
 */
async function attemptLoadIgnoreFromPath(
  directoryPath: string,
): Promise<string[]> {
  try {
    const gitignoreUri = path.join(directoryPath, ".gitignore");

    const gitignoreContentBytes = await fs.readFile(gitignoreUri);
    const gitignoreContent = Buffer.from(gitignoreContentBytes).toString(
      "utf8",
    );

    return gitignoreContent
      .split(/\r?\n/)
      .map((rule) => rule.trim())
      .filter((rule) => rule && !rule.startsWith("#"));
  } catch (e) {
    return [];
  }
}

interface IgnoreInfo {
  ignore: Ignore;
  uri: string;
}

export interface IgnoreWalkOptions {
  dir: string;
  recursive?: boolean;
  abortSignal?: AbortSignal;
  useGitignore?: boolean;
}

async function processDirectoryEntry(
  entry: Dirent,
  currentUri: string,
  rootDir: string,
  directoryIg: Ignore,
  recursive: boolean,
  processedDirs: Set<string>,
  queue: Array<IgnoreInfo>,
  scannedFileResults: FileResult[],
): Promise<boolean> {
  // Returns true if MaxScanItems is reached
  const fullPath = path.join(currentUri, entry.name);
  const relativePath = path.relative(rootDir, fullPath);
  // Normalize path separators to forward slashes for consistent ignore matching
  const normalizedPath = relativePath.replace(/\\/g, "/");

  if (directoryIg.ignores(normalizedPath)) {
    return false;
  }

  if (entry.isDirectory()) {
    if (recursive && !processedDirs.has(fullPath)) {
      queue.push({ uri: fullPath, ignore: directoryIg });
    }
    // Directories are also added to results, similar to files
    scannedFileResults.push({
      filepath: fullPath,
      relativePath,
      isDir: true,
    });
  } else if (entry.isFile()) {
    scannedFileResults.push({
      filepath: fullPath,
      relativePath,
      isDir: false,
    });
  }
  // For both files and directories that are not ignored
  return scannedFileResults.length >= MaxScanItems;
}

export async function ignoreWalk({
  dir,
  recursive = true,
  abortSignal,
  useGitignore = true,
}: IgnoreWalkOptions): Promise<FileResult[]> {
  const scannedFileResults: FileResult[] = [];
  const processedDirs = new Set<string>();
  const queue: Array<IgnoreInfo> = [{ uri: dir, ignore: ignore().add(".git") }];

  logger.trace(
    `Starting traversal from ${dir} with limit ${MaxScanItems}, recursive: ${recursive}`,
  );

  if (abortSignal?.aborted) {
    logger.debug("Traversal aborted before starting.");
    return [];
  }

  let fileScannedCount = 0; // Tracks items processed against MaxScanItems

  while (
    queue.length > 0 &&
    fileScannedCount < MaxScanItems &&
    !abortSignal?.aborted
  ) {
    const current = queue.shift();
    if (!current) continue; // Should not happen if queue.length > 0

    const { uri: currentFsPath, ignore: currentIg } = current;

    if (processedDirs.has(currentFsPath)) {
      continue;
    }
    processedDirs.add(currentFsPath);

    try {
      const newRules = useGitignore
        ? await attemptLoadIgnoreFromPath(currentFsPath)
        : [];
      const directoryIg =
        newRules.length > 0 ? ignore().add(currentIg).add(newRules) : currentIg;

      const entries = await fs.readdir(currentFsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (abortSignal?.aborted) {
          logger.debug("Traversal aborted during directory processing.");
          break; // Break from processing entries in the current directory
        }

        const maxItemsReached = await processDirectoryEntry(
          entry,
          currentFsPath,
          dir,
          directoryIg,
          recursive,
          processedDirs,
          queue,
          scannedFileResults,
        );

        // Increment count for each item considered (file or directory), not just added to results
        // This count is to prevent excessive scanning, not just limiting result size.
        fileScannedCount++;

        if (maxItemsReached || fileScannedCount >= MaxScanItems) {
          logger.debug(
            `MaxScanItems (${MaxScanItems}) reached or exceeded. Halting traversal.`,
          );
          // Ensure the outer while loop also terminates
          // Setting queue.length = 0 is a more direct way to stop if abortSignal is not set
          queue.length = 0;
          break; // Break from processing entries in the current directory
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Error reading directory ${currentFsPath}: ${message}`);
    }
  }

  logger.trace(
    `Completed traversal. Found ${scannedFileResults.length} items. Processed approximately ${fileScannedCount} entries.`,
  );
  return scannedFileResults;
}
