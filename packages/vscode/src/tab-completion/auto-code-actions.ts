import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";

const logger = getLogger("TabCompletion.AutoActions");

export async function applyQuickFixes(uri: vscode.Uri, range: vscode.Range) {
  const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    "vscode.executeCodeActionProvider",
    uri,
    range,
  );
  const quickFixActions = codeActions.filter(
    (action) =>
      action.kind?.contains(vscode.CodeActionKind.QuickFix) &&
      action.title.toLowerCase().includes("import"),
  );

  if (quickFixActions.length === 1 && quickFixActions[0]) {
    const action = quickFixActions[0];
    logger.debug("Auto apply quick fix action.");
    try {
      if (action.edit) {
        await vscode.workspace.applyEdit(action.edit);
      }
      if (action.command) {
        await vscode.commands.executeCommand(
          action.command.command,
          action.command.arguments,
        );
      }
    } catch (error) {
      // ignore errors
    }
  } else {
    logger.debug(
      `Skip quick fix action: ${quickFixActions.length} quick fix actions available.`,
    );
  }
}
