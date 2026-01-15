import { getLogger } from "@/lib/logger";
import type { TabCompletionContext } from "../../../context";
import { isBlank, splitLines } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

function detectIndentation(lines: string[]): string | null {
  const matches = {
    "\t": 0,
    "  ": 0,
    "    ": 0,
  };
  for (const line of lines) {
    if (line.match(/^\t/)) {
      matches["\t"]++;
    } else {
      const spaces = line.match(/^ */)?.[0].length ?? 0;
      if (spaces > 0) {
        if (spaces % 4 === 0) {
          matches["    "]++;
        }
        if (spaces % 2 === 0) {
          matches["  "]++;
        }
      }
    }
  }
  if (matches["\t"] > 0) {
    return "\t";
  }
  if (matches["  "] > matches["    "]) {
    return "  ";
  }
  if (matches["    "] > 0) {
    return "    ";
  }
  return null;
}

function getIndentLevel(line: string, indentation: string): number {
  if (indentation === "\t") {
    return line.match(/^\t*/)?.[0].length ?? 0;
  }
  const spaces = line.match(/^ */)?.[0].length ?? 0;
  return spaces / indentation.length;
}

export const formatIndentation: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  const { prefixLines, suffixLines, currentLinePrefix } = baseSegments;
  const { indentation } = extraSegments?.editorOptions ?? {};
  const inputLines = splitLines(item);

  // if no indentation is specified
  if (!indentation) {
    return item;
  }

  // if there is any indentation in context, the server output should have learned from it
  const prefixLinesForDetection = isBlank(currentLinePrefix)
    ? prefixLines.slice(0, prefixLines.length - 1)
    : prefixLines;
  if (
    prefixLines.length > 1 &&
    detectIndentation(prefixLinesForDetection) !== null
  ) {
    return item;
  }
  const suffixLinesForDetection = suffixLines.slice(1);
  if (
    suffixLines.length > 1 &&
    detectIndentation(suffixLinesForDetection) !== null
  ) {
    return item;
  }

  // if the input is well indented with specific indentation
  const inputLinesForDetection = inputLines.map((line, index) => {
    return index === 0 ? currentLinePrefix + line : line;
  });
  const inputIndentation = detectIndentation(inputLinesForDetection);
  if (inputIndentation === null || inputIndentation === indentation) {
    return item;
  }

  // otherwise, do formatting
  const formatted = inputLinesForDetection.map((line, index) => {
    const level = getIndentLevel(line, inputIndentation);
    if (level === 0) {
      return inputLines[index];
    }
    const rest = line.slice(inputIndentation.length * level);
    if (index === 0) {
      // for first line
      if (!isBlank(currentLinePrefix)) {
        return inputLines[0];
      }
      return indentation.repeat(level).slice(currentLinePrefix.length) + rest;
    }
    // for next lines
    return indentation.repeat(level) + rest;
  });
  logger.trace("Format indentation.", { inputLines, formatted });
  return formatted.join("");
};
