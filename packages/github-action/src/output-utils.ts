/**
 * Utility functions for handling output content
 */

export interface TruncateOptions {
  maxLength?: number;
  headLines?: number;
  tailLines?: number;
}

/**
 * Truncates long output content by keeping head and tail lines
 * @param content - The content to truncate
 * @param options - Truncation options
 * @returns Truncated content with head and tail preserved
 */
export function truncateOutput(
  content: string,
  options: TruncateOptions = {},
): string {
  const { maxLength = 10000, headLines = 20, tailLines = 30 } = options;
  // Return original content if it's within the limit
  if (content.length <= maxLength) {
    return content;
  }

  const lines = content.split("\n");
  const totalLines = lines.length;

  // If total lines are less than or equal to head + tail, return original
  if (totalLines <= headLines + tailLines) {
    return content;
  }

  // Extract head and tail lines
  const headContent = lines.slice(0, headLines);
  const tailContent = lines.slice(-tailLines);

  // Calculate how many lines were omitted
  const omittedLines = totalLines - headLines - tailLines;
  const omittedInfo = `... [${omittedLines} lines truncated] ...`;

  // Combine head, separator, and tail
  return [...headContent, omittedInfo, ...tailContent].join("\n");
}

/**
 * Builds batch output content for comments
 * @param content - The raw output content
 * @param options - Truncation options
 * @returns Formatted content ready for GitHub comment
 */
export function buildBatchOutput(
  content: string,
  options: TruncateOptions = {},
): string {
  return truncateOutput(content, options);
}
