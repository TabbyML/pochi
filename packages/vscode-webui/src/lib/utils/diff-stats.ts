export interface DiffStats {
  added: number;
  removed: number;
}

const HunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Counts added/removed lines in a unified diff the way `git diff --numstat`
 * does: only lines inside hunks are counted, so `---`/`+++` file headers are
 * skipped while content lines that happen to start with `--`/`++` are not.
 */
export function getDiffStats(diff: string): DiffStats {
  let added = 0;
  let removed = 0;
  let oldRemaining = 0;
  let newRemaining = 0;

  for (const line of diff.split("\n")) {
    if (oldRemaining > 0 || newRemaining > 0) {
      if (line.startsWith("+")) {
        added++;
        newRemaining--;
      } else if (line.startsWith("-")) {
        removed++;
        oldRemaining--;
      } else if (!line.startsWith("\\")) {
        oldRemaining--;
        newRemaining--;
      }
      continue;
    }

    const match = HunkHeader.exec(line);
    if (match) {
      oldRemaining = match[1] === undefined ? 1 : Number(match[1]);
      newRemaining = match[2] === undefined ? 1 : Number(match[2]);
    }
  }

  return { added, removed };
}
