import { getLogger } from "@/lib/logger";
import type { NESRequestContext } from "@/nes/contexts";
import type * as vscode from "vscode";

const logger = getLogger("NES.Solution.Filters.RevertingLastEdit");

export function checkRevertingLastEdit(
  context: NESRequestContext,
  target: vscode.TextDocument,
): boolean {
  const editSteps = context.documentContext.editHistory;
  if (editSteps.length > 1) {
    const lastEditStep = editSteps[editSteps.length - 1];
    if (target.getText() === lastEditStep.getBefore().getText()) {
      logger.debug("Detected reverting of the last edit.");
      return true;
    }
  }
  return false;
}
