import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
import type { TerminalTextSelection } from "@getpochi/common/vscode-webui-bridge";
import * as runExclusive from "run-exclusive";
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
 * place). VS Code also shows a "The terminal has no selection to copy"
 * notification in that case; this is only reachable in practice via a race
 * (the caller is gated behind the built-in `terminalTextSelected` context
 * key, so a selection is expected to exist), so the notification is left
 * as-is rather than suppressed.
 *
 * Guarded with `runExclusive` so overlapping calls (e.g. reading multiple
 * terminals' selections in quick succession) can't interleave their
 * clipboard writes/reads, which would otherwise corrupt the clipboard.
 */
export const readTerminalSelection = runExclusive.build(
  async (
    terminal: vscode.Terminal,
    terminalId: string | undefined,
  ): Promise<TerminalTextSelection | undefined> => {
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
  },
);
