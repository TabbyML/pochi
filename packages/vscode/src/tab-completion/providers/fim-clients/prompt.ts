import {
  formatPlaceholders,
  getLanguageCommentChar,
  isBlank,
} from "../../utils";
import type { BaseSegments, ExtraSegments } from "./types";

export function formatPrompt(
  template: string,
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
): string {
  const prompt = buildPrompt(baseSegments, extraSegments);
  return formatPlaceholders(template, {
    prefix: prompt.prompt,
    suffix: prompt.suffix || "",
  });
}

export function buildPrompt(
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
) {
  const commentChar = getLanguageCommentChar(baseSegments.language);
  const codeSnippetsLines: string[] = [];

  for (const snippet of extraSegments?.codeSnippets ?? []) {
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
  const prompt = `${codeSnippets}\n\n${baseSegments.prefixCropped}`;

  return {
    prompt,
    suffix: baseSegments.suffixCropped || undefined,
  };
}
