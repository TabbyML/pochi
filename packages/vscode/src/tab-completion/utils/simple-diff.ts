/**
 * Calculates the line-based difference between two strings.
 * It removes common lines from the start and end of both strings
 * and returns the remaining, differing parts.
 */
export function simpleDiff(
  original: string,
  modified: string,
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

  const originalDiffLines = originalLines.slice(
    commonPrefix,
    originalLines.length - commonSuffix,
  );
  const modifiedDiffLines = modifiedLines.slice(
    commonPrefix,
    modifiedLines.length - commonSuffix,
  );

  if (originalDiffLines.length === 0 && modifiedDiffLines.length === 0) {
    return undefined;
  }

  return {
    original: originalDiffLines.join("\n"),
    modified: modifiedDiffLines.join("\n"),
  };
}
