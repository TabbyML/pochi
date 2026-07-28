import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
import type { TerminalTextSelection } from "@getpochi/common/vscode-webui-bridge";
import * as runExclusive from "run-exclusive";
import * as vscode from "vscode";

const logger = getLogger("ReadTerminalSelection");

/**
 * Best-effort toggle of VS Code's "Do Not Disturb" notification filter.
 * `notifications.toggleDoNotDisturbMode` is a plain flip between "off" and
 * "errors only" (see VS Code's `notificationsCommands.ts`), so calling it is
 * safe even if we don't know the current state. Failures (e.g. the command
 * doesn't exist on older VS Code versions or a fork) are swallowed so callers
 * degrade to the pre-existing behavior instead of throwing.
 */
async function toggleDoNotDisturb(): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      "notifications.toggleDoNotDisturbMode",
    );
  } catch (error) {
    logger.debug(`Failed to toggle Do Not Disturb mode: ${error}`);
  }
}

/**
 * Runs `fn` with VS Code's notification filter temporarily set to
 * "errors only", so any non-error notification `fn` triggers (e.g. the
 * "The terminal has no selection to copy" warning from
 * `workbench.action.terminal.copySelection`) is silently added to the
 * Notification Center instead of popping up as a toast.
 *
 * Toggling on then off again nets out to the original filter state
 * regardless of what it was, since the command is a pure flip. This relies
 * on `readTerminalSelection` (the only caller) being guarded by
 * `runExclusive` so overlapping calls can't interleave their toggles.
 *
 * Caveat: if the process crashes (or `fn` never settles) between the two
 * toggles, the user's notification filter could be left on "errors only"
 * until they toggle it back manually via the bell icon.
 */
async function withDoNotDisturb<T>(fn: () => Thenable<T>): Promise<T> {
  await toggleDoNotDisturb();
  try {
    return await fn();
  } finally {
    await toggleDoNotDisturb();
  }
}

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
 * notification in that case, with no supported API to check for a
 * selection beforehand or to suppress that specific notification
 * (microsoft/vscode#10471 rejected exposing a general context-key read
 * API), so the copy command is run under `withDoNotDisturb` to silence it.
 *
 * Guarded with `runExclusive` so overlapping calls (e.g. reading multiple
 * terminals' selections in quick succession) can't interleave their
 * clipboard writes/reads or their `withDoNotDisturb` toggles, which would
 * otherwise corrupt the clipboard or leave the notification filter stuck.
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
      await withDoNotDisturb(() =>
        vscode.commands.executeCommand(
          "workbench.action.terminal.copySelection",
        ),
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
