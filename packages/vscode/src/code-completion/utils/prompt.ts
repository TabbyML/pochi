import type { CompletionContextSegments } from "../contexts";
import { formatPlaceholders, getLanguageCommentChar, isBlank } from "./strings";

export function buildPrompt(
  template: string,
  segments: CompletionContextSegments,
): string {
  // Replace placeholders in the template with actual segment values
  return formatPlaceholders(template, {
    prefix: buildPrefixWithSegments(segments),
    suffix: segments.suffix || "",
  });
}

function buildPrefixWithSegments(segments: CompletionContextSegments): string {
  const commentChar = getLanguageCommentChar(segments.language);
  const codeSnippetsLines: string[] = [];

  for (const snippet of segments.codeSnippets || []) {
    // if last line is not blank, add a blank line
    if (
      codeSnippetsLines.length > 0 &&
      !isBlank(codeSnippetsLines[codeSnippetsLines.length - 1])
    ) {
      codeSnippetsLines.push("");
    }

    // Add a header line with the file path
    codeSnippetsLines.push(`Path: ${snippet.filepath}`);
    codeSnippetsLines.push(...snippet.text.split("\n"));
  }

  const commentedCodeSnippetsLines = codeSnippetsLines.map((line) => {
    if (isBlank(line)) {
      return "";
    }
    return `${commentChar} ${line}`;
  });

  const codeSnippets = commentedCodeSnippetsLines.join("\n");
  return `${codeSnippets}\n\n${segments.prefix}`;
}
