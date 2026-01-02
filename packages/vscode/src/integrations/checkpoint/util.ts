import { createPrettyPatch } from "@/lib/fs";
import type {
  DiffCheckpointOptions,
  FileDiff,
} from "@getpochi/common/vscode-webui-bridge";
import { diffLines } from "diff";
import { isNonNullish } from "remeda";
import type { FileChange } from "../editor/diff-changes-editor";

export function diffFile(
  before: string,
  after: string,
): {
  added: number;
  removed: number;
} {
  const diffResult = diffLines(before, after);
  let added = 0;
  let removed = 0;

  for (const part of diffResult) {
    const lines = part.value.split("\n");
    // Remove last empty line if it exists
    if (lines[lines.length - 1] === "") {
      lines.pop();
    }

    for (const _line of lines) {
      if (part.added) {
        added++;
      } else if (part.removed) {
        removed++;
      } else {
        // unchanged
      }
    }
  }

  return { added, removed };
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
  changes: FileChange[],
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

      const diff = diffFile(change.before ?? "", change.after ?? "");
      return {
        filepath: change.filepath,
        diff: options?.inlineDiff
          ? createPrettyPatch(
              change.filepath,
              change.before ?? undefined,
              change.after ?? undefined,
            )
          : "",
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
 * @returns Filtered array of FileChange changes
 */
export function filterGitChanges(
  changes: FileChange[],
  maxSizeLimit?: number,
): FileChange[] {
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
