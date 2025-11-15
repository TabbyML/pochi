import type { NESRequestContext } from "@/nes/contexts";
import type { NESSolutionItem } from "./item";

export function isRevertingRecentEdits(
  context: NESRequestContext,
  item: NESSolutionItem,
): boolean {
  const editSteps = context.documentContext.editHistory;
  const targetText = item.target.getText();
  for (const editStep of editSteps) {
    if (targetText === editStep.getBefore().getText()) {
      return true;
    }
  }
  return false;
}
