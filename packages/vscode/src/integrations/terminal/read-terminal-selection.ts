import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
import type { TerminalTextSelection } from "@getpochi/common/vscode-webui-bridge";
import * as vscode from "vscode";

const logger = getLogger("ReadTerminalSelection");

/**
 * Reads the text currently selected in the given terminal, if any.
 *
 * VS Code has no stable API to read or observe a terminal's selection
 * (tracked upstream as https://github.com/microsoft/vscode/issues/188173),
 * so this works around that by briefly copying the selection to the
 * clipboard via `workbench.action.terminal.copySelection` and restoring the
 * clipboard's original content afterwards.
 *
 * A random sentinel value is written to the clipboard before invoking the
 * copy command so we can reliably detect the "no selection" case (the copy
 * command is a no-op when nothing is selected, leaving the sentinel in
 * place).
 */
export async function readTerminalSelection(
  terminal: vscode.Terminal,
  terminalId: string | undefined,
): Promise<TerminalTextSelection | undefined> {
  const originalClipboard = await vscode.env.clipboard.readText();
  const sentinel = `__pochi_empty_selection_${randomUUID()}__`;
  try {
    await vscode.env.clipboard.writeText(sentinel);
    await vscode.commands.executeCommand(
      "workbench.action.terminal.copySelection",
    );
    const result = await vscode.env.clipboard.readText();
    if (result === sentinel) {
      return undefined;
    }
    return {
      terminalName: terminal.name,
      backgroundJobId: terminalId,
      content: result,
    };
  } catch (error) {
    logger.debug(`Failed to read terminal selection: ${error}`);
    return undefined;
  } finally {
    await vscode.env.clipboard.writeText(originalClipboard);
  }
}
