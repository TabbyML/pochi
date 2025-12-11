import type {
  DiffCheckpointOptions,
  FileDiff,
} from "@getpochi/common/vscode-webui-bridge";
import { diffLines } from "diff";
import { isNonNullish } from "remeda";
import type { GitDiff } from "./types";

interface DiffResult {
  content: string;
  added: number;
  removed: number;
}

/**
 * Generates diff content based on original file with diff blocks
 *
 * This creates a unified view showing the complete file content with inline
 * diff markers (+ for additions, - for deletions, unchanged lines as-is).
 * The result represents how the file looks with changes applied inline.
 *
 * @param before - Original file content
 * @param after - Modified file content
 * @returns Formatted diff string with inline markers
 */
export function generateDiffContent(
  before: string,
  after: string,
  inlineDiff?: boolean,
): DiffResult {
  const diffResult = diffLines(before, after);
  const inlineContent = [];
  let added = 0;
  let removed = 0;

  for (const part of diffResult) {
    const lines = part.value.split("\n");
    // Remove last empty line if it exists
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }

    for (const line of lines) {
      if (part.added) {
        added++;
        if (inlineDiff) {
          inlineContent.push(`+ ${line}`);
        }
      } else if (part.removed) {
        removed++;
        if (inlineDiff) {
          inlineContent.push(`- ${line}`);
        }
      } else {
        if (inlineDiff) {
          // Unchanged line
          inlineContent.push(line);
        }
      }
    }
  }

  return { content: inlineContent.join("\n"), added, removed };
}

/**
 * Filters git changes and converts them to FileDiff format
 *
 * Filters out binary files and files exceeding size limits, then generates
 * structured diff data with inline diff content for each valid file.
 *
 * @param changes - Array of git diff changes
 * @param maxSizeLimit - Maximum allowed size for diff content in bytes (default 8KB)
 * @returns Array of FileDiff objects, or null if no valid changes
 */
export function processGitChangesToFileEdits(
  changes: GitDiff[],
  options?: DiffCheckpointOptions,
): Array<FileDiff> | null {
  // Filter out binary files and files that exceed size limits
  const filteredChanges = filterGitChanges(changes, options?.maxSizeLimit);

  if (filteredChanges.length === 0) {
    return null;
  }

  // Generate structured diff data
  const userEdits = filteredChanges
    .map<FileDiff | undefined>((change) => {
      if (change.before === null && change.after === null) {
        return undefined;
      }

      const diff = generateDiffContent(
        change.before ?? "",
        change.after ?? "",
        options?.inlineDiff,
      );
      return {
        filepath: change.filepath,
        diff: diff.content,
        added: diff.added,
        removed: diff.removed,
        created: change.before === null,
        deleted: change.after === null,
      };
    })
    .filter(isNonNullish);

  return userEdits;
}

/**
 * Filters git changes to remove binary files and files exceeding size limits
 *
 * @param changes - Array of git diff changes
 * @param maxSizeLimit - Maximum allowed size for file content in bytes (default 8KB)
 * @returns Filtered array of GitDiff changes
 */
export function filterGitChanges(
  changes: GitDiff[],
  maxSizeLimit?: number,
): GitDiff[] {
  const nullbyte = "\u0000";

  return changes.filter((change) => {
    const isBinary =
      (change.before ?? "").includes(nullbyte) ||
      (change.after ?? "").includes(nullbyte);

    let isTooLarge = false;
    if (maxSizeLimit) {
      isTooLarge =
        Buffer.byteLength(change.before ?? "", "utf8") > maxSizeLimit ||
        Buffer.byteLength(change.after ?? "", "utf8") > maxSizeLimit;
    }
    return !isBinary && !isTooLarge;
  });
}
