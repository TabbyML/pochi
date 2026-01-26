import { get as levenshtein } from "fast-levenshtein";
import { getLogger } from "./base";

const logger = getLogger("diffUtils");

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function normalizeForSearch(content: string): string {
  return normalizeLineEndings(content).trimEnd();
}

export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiffError";
  }
}

/**
 * Parse a diff and apply it to file content (new version matching tools definition)
 */
export async function parseDiffAndApply(
  fileContent: string,
  searchContent: string,
  replaceContent: string,
  expectedReplacements = 1,
): Promise<string> {
  logger.trace(
    `Applying diff with expectedReplacements: ${expectedReplacements}`,
  );

  const isCRLF = fileContent.includes("\r\n");
  // Preserve trailing whitespace (newlines) from the original file
  const normalizedForLineEndings = normalizeLineEndings(fileContent);
  const trimmedContent = normalizedForLineEndings.trimEnd();
  const trailingWhitespace = normalizedForLineEndings.slice(
    trimmedContent.length,
  );

  const normalizedFileContent = normalizeForSearch(fileContent);
  const normalizedSearchContent = normalizeForSearch(searchContent);

  if (searchContent === replaceContent) {
    throw new DiffError(
      "Search content and replace content cannot be the same",
    );
  }

  // Handle empty search content (for creating new files)
  if (searchContent === "") {
    if (fileContent === "") {
      return replaceContent;
    }
    throw new DiffError("Cannot use empty search content on non-empty file");
  }

  // Count occurrences of searchContent in fileContent
  const matches = searchContentExact(
    normalizedFileContent,
    normalizedSearchContent,
  );

  if (matches.length < expectedReplacements) {
    matches.push(
      ...searchContentWithLineTrimmed(
        normalizedFileContent,
        normalizedSearchContent,
      ),
    );

    logger.trace(
      `Found ${matches.length} matches after line trimming search strategy`,
    );
  }

  if (matches.length < expectedReplacements) {
    matches.push(
      ...searchContentByBlockAnchor(
        normalizedFileContent,
        normalizedSearchContent,
      ),
    );
    logger.trace(
      `Found ${matches.length} matches after block anchor search strategy`,
    );
  }

  if (matches.length === 0) {
    throw new DiffError(
      "Search content does not match the file content. Try to reread the file for the latest content.",
    );
  }

  if (matches.length !== expectedReplacements) {
    throw new DiffError(
      `Expected ${expectedReplacements} occurrences but found ${matches.length}. Please verify the search content and expectedReplacements parameter.`,
    );
  }

  // Replace all occurrences
  let result = replaceMatches(normalizedFileContent, matches, replaceContent);
  logger.trace("Successfully applied diff");

  // Restore trailing whitespace (including multiple newlines) if the original file had any
  if (trailingWhitespace && !result.endsWith(trailingWhitespace)) {
    // Remove any trailing whitespace that might have been added by replacement
    result = result.trimEnd() + trailingWhitespace;
  }

  if (isCRLF) {
    return result.replace(/\n/g, "\r\n");
  }

  return result;
}

/**
 * Process multiple diff operations sequentially
 */
export async function processMultipleDiffs(
  fileContent: string,
  edits: Array<{
    searchContent: string;
    replaceContent: string;
    expectedReplacements?: number;
  }>,
): Promise<string> {
  let updatedContent = fileContent;

  for (const edit of edits) {
    updatedContent = await parseDiffAndApply(
      updatedContent,
      edit.searchContent,
      edit.replaceContent,
      edit.expectedReplacements,
    );
  }

  return updatedContent;
}

type ContentMatch = {
  start: number;
  end: number;
};

type SearchContent = (
  originalContent: string,
  searchContent: string,
) => ContentMatch[];

/**
 * Find the all exact matches of searchContent in originalContent
 * @param originalContent The original content to search within
 * @param searchContent The content to search for
 */
const searchContentExact: SearchContent = (
  originalContent: string,
  searchContent: string,
) => {
  const normalizedOriginal = normalizeForSearch(originalContent);
  const normalizedSearch = normalizeForSearch(searchContent);

  if (normalizedSearch === "") return [];

  const matches: ContentMatch[] = [];
  let position = 0;

  while (true) {
    position = normalizedOriginal.indexOf(normalizedSearch, position);
    if (position === -1) break;
    matches.push({ start: position, end: position + normalizedSearch.length });
    position += normalizedSearch.length; // Move past this match
  }

  return matches;
};

/**
 * Find all matches of searchContent in originalContent, ignoring leading and trailing whitespace.
 * For multiple lines, it trims each line before searching.
 * @param originalContent The original content to search within
 * @param searchContent The content to search for
 */
const searchContentWithLineTrimmed: SearchContent = (
  originalContent: string,
  searchContent: string,
) => {
  // Split both contents into lines
  const originalLines = originalContent.split("\n");
  const searchLines = searchContent.split("\n");

  const matches: ContentMatch[] = [];

  // Trim trailing empty line if exists (from the trailing \n in searchContent)
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }

  // For each possible starting position in original content
  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let hasMatches = true;

    // Try to match all search lines from this position
    for (let j = 0; j < searchLines.length; j++) {
      const originalTrimmed = originalLines[i + j].trim();
      const searchTrimmed = searchLines[j].trim();

      if (originalTrimmed !== searchTrimmed) {
        hasMatches = false;
        break;
      }
    }

    // If we found a match, calculate the exact character positions
    if (hasMatches) {
      // Find start character index
      let matchStartIndex = 0;
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1; // +1 for \n
      }

      // Find end character index - don't include the trailing newline of the last matched line
      // This ensures that content after the match (including empty lines) is preserved
      let matchEndIndex = matchStartIndex;
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k].length;
        // Only add newline if not the last matched line
        if (k < searchLines.length - 1) {
          matchEndIndex += 1; // +1 for \n between matched lines
        }
      }

      matches.push({ start: matchStartIndex, end: matchEndIndex });
    }
  }

  return matches;
};

// Similarity thresholds for block anchor fallback matching
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0;
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.0;

/**
 * Attempts to match blocks of code by using the first and last lines as anchors,
 * with similarity checking to prevent false positives.
 * This is a third-tier fallback strategy that helps match blocks where we can identify
 * the correct location by matching the beginning and end, even if the exact content
 * differs slightly.
 *
 * The matching strategy:
 * 1. Only attempts to match blocks of 3 or more lines to avoid false positives
 * 2. Extracts from the search content:
 *    - First line as the "start anchor"
 *    - Last line as the "end anchor"
 * 3. Collects all candidate positions where both anchors match
 * 4. Uses levenshtein distance to calculate similarity of middle lines
 * 5. Returns match only if similarity meets threshold requirements
 *
 * This approach is particularly useful for matching blocks of code where:
 * - The exact content might have minor differences
 * - The beginning and end of the block are distinctive enough to serve as anchors
 * - The overall structure (number of lines) remains the same
 * - The middle content is reasonably similar (prevents false positives)
 *
 * @param originalContent The original content to search within
 * @param searchContent The content to search for
 * @returns An array of content matches
 */
const searchContentByBlockAnchor: SearchContent = (
  originalContent: string,
  searchContent: string,
) => {
  const originalLines = originalContent.split("\n");
  const searchLines = searchContent.split("\n");
  const matches: ContentMatch[] = [];

  // Only use this approach for blocks of 3+ lines
  if (searchLines.length < 3) {
    return matches;
  }

  // Trim trailing empty line if exists
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }

  const firstLineSearch = searchLines[0].trim();
  const lastLineSearch = searchLines[searchLines.length - 1].trim();
  const searchBlockSize = searchLines.length;

  // Collect all candidate positions
  const candidates: number[] = [];
  for (let i = 0; i <= originalLines.length - searchBlockSize; i++) {
    if (
      originalLines[i].trim() === firstLineSearch &&
      originalLines[i + searchBlockSize - 1].trim() === lastLineSearch
    ) {
      candidates.push(i);
    }
  }

  // Return immediately if no candidates
  if (candidates.length === 0) {
    return matches;
  }

  // Handle single candidate scenario (using relaxed threshold)
  if (candidates.length === 1) {
    const i = candidates[0];
    let similarity = 0;
    const linesToCheck = searchBlockSize - 2;

    for (let j = 1; j < searchBlockSize - 1; j++) {
      const originalLine = originalLines[i + j].trim();
      const searchLine = searchLines[j].trim();
      const maxLen = Math.max(originalLine.length, searchLine.length);
      if (maxLen === 0) {
        continue;
      }
      const distance = levenshtein(originalLine, searchLine);
      similarity += (1 - distance / maxLen) / linesToCheck;

      // Exit early when threshold is reached
      if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
        break;
      }
    }

    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      let matchStartIndex = 0;
      for (let k = 0; k < i; k++) {
        matchStartIndex += originalLines[k].length + 1;
      }
      // Don't include the trailing newline of the last matched line
      let matchEndIndex = matchStartIndex;
      for (let k = 0; k < searchBlockSize; k++) {
        matchEndIndex += originalLines[i + k].length;
        // Only add newline if not the last matched line
        if (k < searchBlockSize - 1) {
          matchEndIndex += 1;
        }
      }
      matches.push({ start: matchStartIndex, end: matchEndIndex });
    }
    return matches;
  }

  // Calculate similarity for multiple candidates
  let bestMatchIndex = -1;
  let maxSimilarity = -1;

  for (const i of candidates) {
    let similarity = 0;
    for (let j = 1; j < searchBlockSize - 1; j++) {
      const originalLine = originalLines[i + j].trim();
      const searchLine = searchLines[j].trim();
      const maxLen = Math.max(originalLine.length, searchLine.length);
      if (maxLen === 0) {
        continue;
      }
      const distance = levenshtein(originalLine, searchLine);
      similarity += 1 - distance / maxLen;
    }
    similarity /= searchBlockSize - 2; // Average similarity

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatchIndex = i;
    }
  }

  // Threshold judgment
  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD) {
    const i = bestMatchIndex;
    let matchStartIndex = 0;
    for (let k = 0; k < i; k++) {
      matchStartIndex += originalLines[k].length + 1;
    }
    // Don't include the trailing newline of the last matched line
    let matchEndIndex = matchStartIndex;
    for (let k = 0; k < searchBlockSize; k++) {
      matchEndIndex += originalLines[i + k].length;
      // Only add newline if not the last matched line
      if (k < searchBlockSize - 1) {
        matchEndIndex += 1;
      }
    }
    matches.push({ start: matchStartIndex, end: matchEndIndex });
  }
  return matches;
};

const replaceMatches = (
  originalContent: string,
  matches: ContentMatch[],
  replaceContent: string,
): string => {
  let updatedContent = originalContent;
  let offset = 0;

  for (const match of matches) {
    const start = match.start + offset;
    const end = match.end + offset;
    updatedContent =
      updatedContent.slice(0, start) +
      replaceContent +
      updatedContent.slice(end);
    offset += replaceContent.length - (end - start);
  }

  return updatedContent;
};
