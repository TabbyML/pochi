import { getLogger } from "@getpochi/common";
import { type CompletionList, commands, window } from "vscode";

const logger = getLogger("completion");

let lastUri = "";
let lastCandidates: string[] = [];

export const listDocumentCompletion = async (): Promise<string[]> => {
  const editor = window.activeTextEditor;
  if (!editor) {
    logger.warn("listAutoCompleteCandidates: No active text editor found.");
    return [];
  }
  const { document } = editor;
  const uri = document.uri.toString();
  if (uri === lastUri) {
    return lastCandidates;
  }

  const position = document.lineAt(document.lineCount - 1).range.end;

  try {
    const completions = await commands.executeCommand<CompletionList>(
      "vscode.executeCompletionItemProvider",
      document.uri,
      position,
    );

    const candidates =
      completions?.items.map((item) => {
        if (typeof item.label === "string") {
          return item.label;
        }
        return item.label.label;
      }) || [];

    lastCandidates = [...new Set(candidates)];
    lastUri = uri;

    logger.debug(
      `listAutoCompleteCandidates: Found ${candidates.length} candidates, ${lastCandidates.length} unique candidates.`,
      document.uri.toString(),
    );
    return lastCandidates;
  } catch (error) {
    logger.error(`listAutoCompleteCandidates: Failed - ${error}`);
    return [];
  }
};
