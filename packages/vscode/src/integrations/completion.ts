import { getLogger } from "@getpochi/common";
import { window } from "vscode";

const logger = getLogger("completion");

export const listDocumentCompletion = () => {
  const candidates: string[] = [];
  for (const x of window.visibleTextEditors) {
    candidates.push(...getUniqueTokens(x.document.getText()));
  }

  const uniqueCandidates = [...new Set(candidates)];
  logger.debug(`listCompletions: ${uniqueCandidates.length} candidates`);
  return uniqueCandidates;
};

function getUniqueTokens(rawText: string): string[] {
  // 1. Define the regular expression to find all "words".
  //    - [\w_]+ : Matches one or more word characters (a-z, A-Z, 0-9) or underscores.
  //    - g       : The global flag, to find all matches in the string, not just the first.
  const wordRegex = /[\w_]+/g;

  // 2. Extract all matching tokens.
  //    - String.prototype.match() returns an array of all matches or `null` if no matches are found.
  //    - We use `|| []` to gracefully handle the `null` case by providing an empty array.
  return rawText.match(wordRegex) || [];
}
