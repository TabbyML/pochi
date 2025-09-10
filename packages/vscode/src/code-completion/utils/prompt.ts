import type { CompletionContextSegments } from "../contexts";
import { formatPlaceholders, getLanguageCommentChar, isBlank } from "./strings";

export function formatPrompt(
  template: string,
  segments: CompletionContextSegments,
): string {
  const prompt = buildPrompt(segments);
  return formatPlaceholders(template, {
    prefix: prompt.prompt,
    suffix: prompt.suffix || "",
  });
}

export function buildPrompt(segments: CompletionContextSegments) {
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
  const prompt = `${codeSnippets}\n\n${segments.prefix}`;

  return {
    prompt,
    suffix: segments.suffix || undefined,
  };
}
