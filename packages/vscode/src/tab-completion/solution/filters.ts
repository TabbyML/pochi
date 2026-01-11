import type { TabCompletionContext } from "../context";
import { applyEdit } from "../utils";
import type { TabCompletionSolutionItem } from "./item";

export function isRevertingRecentEdits(
  context: TabCompletionContext,
  item: TabCompletionSolutionItem,
): boolean {
  const editSteps = context.editHistory;
  if (!editSteps || editSteps.length === 0) {
    return false;
  }
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
