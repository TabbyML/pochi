/**
 * Calculates the line-based difference between two strings.
 * It removes common lines from the start and end of both strings
 * and returns the remaining, differing parts, with a specified number of context lines.
 */
export function simpleDiff(
  original: string,
  modified: string,
  context = 2,
): { original: string; modified: string } | undefined {
  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");

  let commonPrefix = 0;
  while (
    commonPrefix < originalLines.length &&
    commonPrefix < modifiedLines.length &&
    originalLines[commonPrefix] === modifiedLines[commonPrefix]
  ) {
    commonPrefix++;
  }

  let commonSuffix = 0;
  while (
    commonSuffix < originalLines.length - commonPrefix &&
    commonSuffix < modifiedLines.length - commonPrefix &&
    originalLines[originalLines.length - 1 - commonSuffix] ===
      modifiedLines[modifiedLines.length - 1 - commonSuffix]
  ) {
    commonSuffix++;
  }

  const originalDiffStart = commonPrefix;
  const originalDiffEnd = originalLines.length - commonSuffix;
  const modifiedDiffStart = commonPrefix;
  const modifiedDiffEnd = modifiedLines.length - commonSuffix;

  if (
    originalDiffStart === originalDiffEnd &&
    modifiedDiffStart === modifiedDiffEnd
  ) {
    return undefined;
  }

  const originalStart = Math.max(0, originalDiffStart - context);
  const originalEnd = Math.min(originalLines.length, originalDiffEnd + context);
  const modifiedStart = Math.max(0, modifiedDiffStart - context);
  const modifiedEnd = Math.min(modifiedLines.length, modifiedDiffEnd + context);

  const originalDiffLines = originalLines.slice(originalStart, originalEnd);
  const modifiedDiffLines = modifiedLines.slice(modifiedStart, modifiedEnd);

  return {
    original: originalDiffLines.join("\n"),
    modified: modifiedDiffLines.join("\n"),
  };
}
