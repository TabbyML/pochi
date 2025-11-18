import type { NESRequestContext } from "@/nes/contexts";
import { applyEdit } from "../utils";
import type { NESSolutionItem } from "./item";

export function isRevertingRecentEdits(
  context: NESRequestContext,
  item: NESSolutionItem,
): boolean {
  const editSteps = context.documentContext.editHistory;
  const targetText = item.target.getText();
  // For every EditStep, check the state of start
  for (const editStep of editSteps) {
    if (targetText === editStep.getBefore().getText()) {
      return true;
    }
  }
  // For the last EditStep, check every change
  if (editSteps.length > 0) {
    const lastEditStep = editSteps[editSteps.length - 1];
    let before = lastEditStep.getBefore().getText();
    for (const edit of lastEditStep.getEdits()) {
      const { text } = applyEdit(before, edit);
      if (targetText === text) {
        return true;
      }
      before = text;
    }
  }
  return false;
}
