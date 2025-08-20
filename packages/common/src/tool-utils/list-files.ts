import path from "node:path";
import { getLogger } from "../base";
import { resolvePath, validateRelativePath } from "./fs";
import { ignoreWalk } from "./ignore-walk";
import { MaxListFileItems } from "./limits";

const logger = getLogger("listFiles");

interface ListFilesOptions {
  cwd: string;
  /** The relative directory path to list files from */
  path: string;
  /** Whether to recursively list files */
  recursive?: boolean;
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;
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
  const { cwd, path: dirPath, recursive, abortSignal } = options;

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
    });

    const isTruncated = fileResults.length > MaxListFileItems;
    const files = fileResults
      .slice(0, MaxListFileItems)
      .map((x) => path.relative(cwd, x.filepath));

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
  } = options;

  logger.debug("Listing workspace files from", cwd, "with maxItems", maxItems);

  try {
    const results = await ignoreWalk({
      dir: cwd,
      recursive,
      abortSignal,
    });

    const isTruncated = results.length > maxItems;
    const files = results.slice(0, maxItems).map((res) => {
      return path.relative(cwd, res.filepath);
    });

    return { files, isTruncated };
  } catch (error) {
    logger.warn("Failed to list workspace files:", error);
    // If ignoreWalk fails, return empty results
    return { files: [], isTruncated: false };
  }
}
