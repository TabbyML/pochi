import { diffLines } from "diff";
import type { GitDiff } from "./types";

export class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

/**
 * Generates inline diff content based on original file with diff blocks
 *
 * This creates a unified view showing the complete file content with inline
 * diff markers (+ for additions, - for deletions, unchanged lines as-is).
 * The result represents how the file looks with changes applied inline.
 *
 * @param before - Original file content
 * @param after - Modified file content
 * @returns Formatted diff string with inline markers
 */
export function generateInlineDiffContent(
  before: string,
  after: string,
): string {
  const diffResult = diffLines(before, after);
  const inlineContent = [];

  for (const part of diffResult) {
    const lines = part.value.split("\n");
    // Remove last empty line if it exists
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }

    for (const line of lines) {
      if (part.added) {
        inlineContent.push(`+ ${line}`);
      } else if (part.removed) {
        inlineContent.push(`- ${line}`);
      } else {
        // Unchanged line
        inlineContent.push(line);
      }
    }
  }

  return inlineContent.join("\n");
}

/**
 * Filters git changes and converts them to UserEditsDiff format
 *
 * Filters out binary files and files exceeding size limits, then generates
 * structured diff data with inline diff content for each valid file.
 *
 * @param changes - Array of git diff changes
 * @param maxSizeLimit - Maximum allowed size for diff content in bytes (default 8KB)
 * @returns Array of UserEditsDiff objects, or null if no valid changes
 */
export function processGitChangesToUserEdits(
  changes: GitDiff[],
  maxSizeLimit = 8 * 1024,
): Array<{ filepath: string; diff: string }> | null {
  // Filter out binary files and files that exceed size limits
  const filteredChanges = filterGitChanges(changes, maxSizeLimit);

  if (filteredChanges.length === 0) {
    return null;
  }

  // Generate structured diff data
  const userEdits = filteredChanges.map((change) => ({
    filepath: change.filepath,
    diff: generateInlineDiffContent(change.before, change.after),
  }));

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
  maxSizeLimit = 8 * 1024,
): GitDiff[] {
  const nullbyte = "\u0000";

  return changes.filter((change) => {
    const isBinary =
      change.before.includes(nullbyte) || change.after.includes(nullbyte);
    const isTooLarge =
      Buffer.byteLength(change.before, "utf8") > maxSizeLimit ||
      Buffer.byteLength(change.after, "utf8") > maxSizeLimit;
    return !isBinary && !isTooLarge;
  });
}
