/**
 * Filter markdown code blocks from text content
 * Replaces ```language\ncontent\n``` or ```\ncontent\n``` blocks with a code block showing omission message
 * Only omits code blocks longer than 512 characters, shows character count for omitted blocks
 * Keeps shorter code blocks as they are
 */
function filterMarkdownFromText(text: string): string {
  if (typeof text !== "string") {
    return text;
  }
  const markdownBlockPattern = /```([\w]*)\n([\s\S]*?)\n```/g;
  let filtered = text.replace(
    markdownBlockPattern,
    (match, language, content) => {
      // Only omit code blocks longer than 512 characters
      if (content.length > 512) {
        return `\n\n\`\`\`\n[ ... ${language} code block omitted (${content.length} characters) ... ]\n\`\`\`\n\n`;
      }
      // For shorter code blocks, keep them as they are (no change)
      return match;
    },
  );
  filtered = filtered.replace(/\n\s*\n\s*\n/g, "\n\n");
  filtered = filtered.trim();
  return filtered;
}
/**
 * Unified safe markdown filter
 * Automatically detects input type and applies appropriate filtering
 * Returns original input if filtering fails
 */
// biome-ignore lint/suspicious/noExplicitAny: filtering any input type
function filterPlayrightMarkdown(input: any): any {
  try {
    if (typeof input === "string") {
      return filterMarkdownFromText(input);
    }
  } catch (error) {}
  return input;
}

export { filterPlayrightMarkdown };
