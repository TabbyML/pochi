import path from "node:path";
import { getLogger } from "../base";
import { resolvePath, validateRelativePath } from "./fs";
import { ignoreWalk } from "./ignore-walk";
import { MaxListFileCharLength, MaxListFileItems } from "./limits";

const logger = getLogger("listFiles");

interface ListFilesOptions {
  cwd: string;
  /** The relative directory path to list files from */
  path: string;
  /** Whether to recursively list files */
  recursive?: boolean;
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;
  /** Maximum total character length of files to return before truncating */
  maxCharLength?: number;
}

interface ListFilesResult {
  /** Array of relative file paths */
  files: string[];
  /** Whether the results were truncated due to MaxListFileItems limit */
  isTruncated: boolean;
}

/**
 * Common utility for listing files with ignore patterns applied.
 * This function abstracts the common logic between different implementations
 * (runner vs vscode) while allowing them to provide their own path handling.
 */
export async function listFiles(
  options: ListFilesOptions,
): Promise<ListFilesResult> {
  const {
    cwd,
    path: dirPath,
    recursive,
    abortSignal,
    maxCharLength = MaxListFileCharLength,
  } = options;

  logger.debug(
    "handling listFile with dirPath",
    dirPath,
    "and recursive",
    recursive,
  );

  // Resolve path (absolute or relative)
  const dir = resolvePath(dirPath, cwd);

  // Only validate relative paths
  if (!path.isAbsolute(dirPath)) {
    validateRelativePath(dirPath);
  }

  try {
    const fileResults = await ignoreWalk({
      dir,
      recursive: !!recursive,
      abortSignal,
      useGitignore: false,
      usePochiignore: false,
    });

    const allFiles = fileResults.map((x) => path.relative(cwd, x.filepath));

    let totalChars = 0;
    const files: string[] = [];
    for (const file of allFiles) {
      if (files.length >= MaxListFileItems) {
        break;
      }
      if (files.length > 0 && totalChars + file.length > maxCharLength) {
        break;
      }
      files.push(file);
      totalChars += file.length;
    }

    const isTruncated = fileResults.length > files.length;

    return { files, isTruncated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error listing files:", errorMessage);
    throw new Error(`Failed to list files: ${errorMessage}`);
  }
}

interface WorkspaceFilesOptions {
  /** The root directory path to list files from */
  cwd: string;
  /** Whether to recursively list files */
  recursive?: boolean;
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;
  /** Maximum number of files to return before truncating */
  maxItems?: number;
  /** Maximum total character length of files to return before truncating */
  maxCharLength?: number;
  /** Extra ignore patterns to apply on top of gitignore/pochiignore rules */
  extraIgnorePatterns?: string[];
}

interface WorkspaceFilesResult {
  /** Array of relative file paths from the workspace root */
  files: string[];
  /** Whether the results were truncated due to maxItems limit */
  isTruncated: boolean;
}

/**
 * Lists all files in a workspace directory with truncation logic.
 * This is a common utility for workspace file enumeration used across different contexts.
 */
export async function listWorkspaceFiles(
  options: WorkspaceFilesOptions,
): Promise<WorkspaceFilesResult> {
  const {
    cwd,
    recursive = true,
    abortSignal,
    maxItems = MaxListFileItems,
    maxCharLength = MaxListFileCharLength,
    extraIgnorePatterns,
  } = options;

  logger.debug(
    "Listing workspace files from",
    cwd,
    "with maxItems",
    maxItems,
    "and maxCharLength",
    maxCharLength,
  );

  try {
    const results = await ignoreWalk({
      dir: cwd,
      recursive,
      abortSignal,
      extraIgnorePatterns,
    });

    const allFiles = results.map((res) => path.relative(cwd, res.filepath));

    let totalChars = 0;
    const files: string[] = [];
    for (const file of allFiles) {
      if (files.length >= maxItems) {
        break;
      }
      if (files.length > 0 && totalChars + file.length > maxCharLength) {
        break;
      }
      files.push(file);
      totalChars += file.length;
    }

    const isTruncated = results.length > files.length;

    return { files, isTruncated };
  } catch (error) {
    logger.warn("Failed to list workspace files:", error);
    // If ignoreWalk fails, return empty results
    return { files: [], isTruncated: false };
  }
}
