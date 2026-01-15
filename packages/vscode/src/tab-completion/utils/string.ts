// Split lines and keep newline character for each line
export function splitLines(input: string) {
  const lines = input.match(/.*(?:$|\r?\n)/g)?.filter(Boolean) ?? [];
  if (lines.length > 0 && lines[lines.length - 1]?.endsWith("\n")) {
    // Keep last empty line
    lines.push("");
  }
  return lines;
}

export function isBlank(input: string) {
  return input.trim().length === 0;
}

/**
 * Format placeholders in the template string.
 * Example:
 * ```
 *   formatPlaceholders("Hello {{name}}", { name: "World" })
 * ```
 * @param template a string with placeholders in the form {{key}}
 * @param replacements a map of replacements for the placeholders
 * @returns a string with the placeholders replaced
 */
export function formatPlaceholders(
  template: string,
  replacements: Record<string, string>,
): string {
  const patterns = Object.keys(replacements)
    .map((key) => `{{${key}}}`)
    .join("|");
  const regexp = new RegExp(patterns, "g");
  return template.replace(regexp, (pattern: string) => {
    const key = pattern.slice(2, -2);
    return replacements[key] ?? "";
  });
}

/**
 * Crop the text to fit within the specified character limit.
 * If the text is cropped, it ensures the last line is complete by trimming at the last newline.
 *
 * @param text The input text to crop.
 * @param maxChars The maximum number of characters allowed.
 * @returns The cropped text.
 */
export function cropTextToMaxChars(text: string, maxChars: number): string {
  let croppedText = text;
  if (croppedText.length > maxChars) {
    croppedText = croppedText.slice(0, maxChars);
    const lastNewLine = croppedText.lastIndexOf("\n");
    if (lastNewLine > 0) {
      croppedText = croppedText.slice(0, lastNewLine + 1);
    }
  }
  return croppedText;
}
