import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Ignore } from "ignore";
import ignore from "ignore";
import { getLogger } from "../base";

const logger = getLogger("ignoreWalk");

// Constants
const MaxScanItems = 10_000;
const DefaultIgnoredDirectories = [".git"];
const GitignoreFilename = ".gitignore";
const PochiignoreFilename = ".pochiignore";

// Types
export interface FileResult {
  filepath: string;
  isDir: boolean;
  relativePath: string;
}

export interface IgnoreWalkOptions {
  dir: string;
  recursive?: boolean;
  abortSignal?: AbortSignal;
  useGitignore?: boolean;
  usePochiignore?: boolean;
}

interface IgnoreInfo {
  ignore: Ignore;
  uri: string;
}

interface TraversalState {
  scannedFileResults: FileResult[];
  processedDirs: Set<string>;
  queue: Array<IgnoreInfo>;
  fileScannedCount: number;
}

/**
 * Attempts to load and parse ignore rules from the specified file
 * @param directoryPath Path to directory that may contain an ignore file
 * @param filename Name of the ignore file (e.g., .gitignore)
 * @returns Array of parsed ignore rules (empty if file not found)
 */
async function loadIgnoreRules(
  directoryPath: string,
  filename: string,
): Promise<string[]> {
  try {
    const ignoreFilePath = path.join(directoryPath, filename);
    const ignoreFileContent = await fs.readFile(ignoreFilePath, "utf8");

    return ignoreFileContent
      .split(/\r?\n/)
      .map((rule) => rule.trim())
      .filter((rule) => rule && !rule.startsWith("#"));
  } catch {
    return [];
  }
}

/**
 * Loads all applicable ignore rules for a directory
 * @param directoryPath Path to directory to load ignore rules for
 * @param useGitignore Whether to load .gitignore rules
 * @param usePochiignore Whether to load .pochiignore rules
 * @returns Array of all ignore rules to apply
 */
async function loadAllIgnoreRules(
  directoryPath: string,
  useGitignore: boolean,
  usePochiignore: boolean,
): Promise<string[]> {
  const rules: string[] = [];

  if (useGitignore) {
    const gitIgnoreRules = await loadIgnoreRules(
      directoryPath,
      GitignoreFilename,
    );
    rules.push(...gitIgnoreRules);
  }

  if (usePochiignore) {
    const pochiIgnoreRules = await loadIgnoreRules(
      directoryPath,
      PochiignoreFilename,
    );
    rules.push(...pochiIgnoreRules);
  }

  return rules;
}

/**
 * Creates an ignore matcher with parent rules and directory-specific rules
 * @param parentIgnore Parent ignore matcher to inherit rules from
 * @param directoryRules Additional rules specific to current directory
 * @returns New ignore matcher with combined rules
 */
function createIgnoreMatcher(
  parentIgnore: Ignore,
  directoryRules: string[],
): Ignore {
  return ignore().add(parentIgnore).add(directoryRules);
}

/**
 * Normalizes a path for consistent ignore pattern matching
 * @param relativePath Relative path to normalize
 * @param isDirectory Whether the path represents a directory
 * @returns Normalized path with forward slashes and trailing slash for directories
 */
function normalizePathForIgnore(
  relativePath: string,
  isDirectory: boolean,
): string {
  const normalized = relativePath.replace(/\\/g, "/");
  return isDirectory ? `${normalized}/` : normalized;
}

/**
 * Checks if a path should be ignored based on ignore rules
 * @param relativePath Relative path from root directory
 * @param isDirectory Whether the path is a directory
 * @param ignoreMatcher Ignore matcher to test against
 * @returns True if path should be ignored
 */
function shouldIgnorePath(
  relativePath: string,
  isDirectory: boolean,
  ignoreMatcher: Ignore,
): boolean {
  const normalizedPath = normalizePathForIgnore(relativePath, isDirectory);
  return ignoreMatcher.ignores(normalizedPath);
}

/**
 * Checks if the scan limit has been reached
 * @param state Current traversal state
 * @returns True if MaxScanItems has been reached or exceeded
 */
function hasReachedScanLimit(state: TraversalState): boolean {
  return (
    state.fileScannedCount >= MaxScanItems ||
    state.scannedFileResults.length >= MaxScanItems
  );
}

/**
 * Processes a single directory entry (file or directory)
 * @param entry Directory entry from fs.readdir
 * @param currentUri Current directory path being processed
 * @param rootDir Root directory of the traversal
 * @param ignoreMatcher Ignore matcher for the current directory
 * @param state Current traversal state
 * @param recursive Whether to process directories recursively
 * @returns True if MaxScanItems limit was reached
 */
async function processDirectoryEntry(
  entry: Dirent,
  currentUri: string,
  rootDir: string,
  ignoreMatcher: Ignore,
  state: TraversalState,
  recursive: boolean,
): Promise<boolean> {
  const fullPath = path.join(currentUri, entry.name);
  const relativePath = path.relative(rootDir, fullPath);
  const isDirectory = entry.isDirectory();
  const isFile = entry.isFile();

  // Skip entries that are neither files nor directories
  if (!isDirectory && !isFile) {
    return false;
  }

  // Check if path should be ignored
  if (shouldIgnorePath(relativePath, isDirectory, ignoreMatcher)) {
    return false;
  }

  // Add to results
  state.scannedFileResults.push({
    filepath: fullPath,
    relativePath,
    isDir: isDirectory,
  });

  // Enqueue directory for recursive processing
  const shouldEnqueue =
    isDirectory && recursive && !state.processedDirs.has(fullPath);
  if (shouldEnqueue) {
    state.queue.push({ uri: fullPath, ignore: ignoreMatcher });
  }

  // Increment scan count
  state.fileScannedCount++;

  return hasReachedScanLimit(state);
}

/**
 * Processes all entries in a directory
 * @param directoryPath Path to directory to process
 * @param rootDir Root directory of the traversal
 * @param parentIgnore Parent ignore matcher
 * @param state Current traversal state
 * @param recursive Whether to process directories recursively
 * @param useGitignore Whether to load .gitignore rules
 * @param usePochiignore Whether to load .pochiignore rules
 * @param abortSignal Optional abort signal to cancel processing
 * @returns True if scan should be aborted
 */
async function processDirectory(
  directoryPath: string,
  rootDir: string,
  parentIgnore: Ignore,
  state: TraversalState,
  recursive: boolean,
  useGitignore: boolean,
  usePochiignore: boolean,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  try {
    // Load ignore rules for this directory
    const directoryRules = await loadAllIgnoreRules(
      directoryPath,
      useGitignore,
      usePochiignore,
    );

    // Create ignore matcher with parent and directory rules
    const ignoreMatcher = createIgnoreMatcher(parentIgnore, directoryRules);

    // Read directory entries
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    // Process each entry
    for (const entry of entries) {
      if (abortSignal?.aborted) {
        logger.debug("Traversal aborted during directory processing.");
        return true; // Signal to abort
      }

      const limitReached = await processDirectoryEntry(
        entry,
        directoryPath,
        rootDir,
        ignoreMatcher,
        state,
        recursive,
      );

      if (limitReached) {
        logger.debug(
          `MaxScanItems (${MaxScanItems}) reached or exceeded. Halting traversal.`,
        );
        return true; // Signal to abort
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Error reading directory ${directoryPath}: ${message}`);
  }

  return false; // Continue processing
}

/**
 * Initializes the traversal state
 * @param startDir Starting directory for traversal
 * @returns Initial traversal state
 */
function initializeTraversalState(startDir: string): TraversalState {
  const initialIgnore = ignore().add(
    DefaultIgnoredDirectories.map((dir) => `${dir}/`),
  );

  return {
    scannedFileResults: [],
    processedDirs: new Set<string>(),
    queue: [{ uri: startDir, ignore: initialIgnore }],
    fileScannedCount: 0,
  };
}

/**
 * Checks if traversal should continue
 * @param state Current traversal state
 * @param abortSignal Optional abort signal
 * @returns True if traversal should continue
 */
function shouldContinueTraversal(
  state: TraversalState,
  abortSignal?: AbortSignal,
): boolean {
  return (
    state.queue.length > 0 &&
    !hasReachedScanLimit(state) &&
    !abortSignal?.aborted
  );
}

/**
 * Traverses a directory tree, respecting ignore rules and collecting file information
 * @param options Traversal options
 * @returns Array of file results found during traversal
 */
export async function ignoreWalk({
  dir,
  recursive = true,
  abortSignal,
  useGitignore = true,
  usePochiignore = true,
}: IgnoreWalkOptions): Promise<FileResult[]> {
  logger.debug(
    `Starting traversal from ${dir} with limit ${MaxScanItems}, recursive: ${recursive}`,
  );

  if (abortSignal?.aborted) {
    logger.debug("Traversal aborted before starting.");
    return [];
  }

  const state = initializeTraversalState(dir);

  while (shouldContinueTraversal(state, abortSignal)) {
    const current = state.queue.shift();
    if (!current) continue;

    const { uri: currentFsPath, ignore: currentIg } = current;

    // Skip if already processed
    if (state.processedDirs.has(currentFsPath)) {
      continue;
    }
    state.processedDirs.add(currentFsPath);

    // Process directory and check if we should abort
    const shouldAbort = await processDirectory(
      currentFsPath,
      dir,
      currentIg,
      state,
      recursive,
      useGitignore,
      usePochiignore,
      abortSignal,
    );

    if (shouldAbort) {
      state.queue.length = 0; // Clear queue to exit loop
      break;
    }
  }

  logger.debug(
    `Completed traversal. Found ${state.scannedFileResults.length} items. Processed approximately ${state.fileScannedCount} entries.`,
  );

  return state.scannedFileResults;
}
