import type * as vscode from "vscode";
import type { TabCompletionContext } from "../../context";
import { cropTextToMaxChars, getRelativePath, isBlank } from "../../utils";

export function getNotebookCellsContext(
  context: TabCompletionContext,
  maxCharsPerCell?: number,
): { filepath: string; text: string }[] | undefined {
  const notebookCells = context.notebookCells;
  if (!notebookCells) {
    return undefined;
  }

  const currentCellIndex = notebookCells.indexOf(context.document);
  if (currentCellIndex < 0 || currentCellIndex >= notebookCells.length) {
    return undefined;
  }

  const currentLanguageId = context.document.languageId;
  const formatCell = (textDocument: vscode.TextDocument): string => {
    const notebookLanguageComments: {
      [languageId: string]: (code: string) => string;
    } = {
      // biome-ignore lint/style/useTemplate: <explanation>
      markdown: (code) => "```\n" + code + "\n```",
      python: (code) =>
        code
          .split("\n")
          .map((l) => `# ${l}`)
          .join("\n"),
    };
    if (textDocument.languageId === currentLanguageId) {
      return textDocument.getText();
    }
    if (Object.keys(notebookLanguageComments).includes(currentLanguageId)) {
      return (
        notebookLanguageComments[textDocument.languageId]?.(
          textDocument.getText(),
        ) ?? ""
      );
    }
    return "";
  };

  return notebookCells
    .map((cell, index) => {
      if (index === currentCellIndex) return undefined;
      let text = formatCell(cell);
      if (isBlank(text)) return undefined;
      if (maxCharsPerCell) {
        text = cropTextToMaxChars(text, maxCharsPerCell);
      }
      return {
        filepath: getRelativePath(cell.uri),
        text,
      };
    })
    .filter((cell): cell is NonNullable<typeof cell> => cell !== undefined);
}
