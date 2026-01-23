import { getLogger } from "@/lib/logger";
import type { TabCompletionContext } from "../context";
import type { TabCompletionProviderResponseItem } from "../providers/types";
import { isRevertingRecentEdits } from "./filters";
import { TabCompletionSolutionItem } from "./item";

export type { OnDidAcceptInlineCompletionItemParams } from "./item";

const logger = getLogger("TabCompletion.Solution");

export class TabCompletionSolution {
  public readonly items: TabCompletionSolutionItem[] = [];

  constructor(public readonly context: TabCompletionContext) {}

  // return true if added, return false if denied by filters
  addItem(source: TabCompletionProviderResponseItem): boolean {
    const item = new TabCompletionSolutionItem(this.context, source);

    if (!item.valid) {
      logger.debug("Item is invalid.");
      return false;
    }

    if (this.items.some((i) => i.target.getText() === item.target.getText())) {
      logger.debug("Item is a duplicate.");
      return false;
    }

    if (isRevertingRecentEdits(this.context, item)) {
      logger.debug("Detected reverting recent edits.");
      return false;
    }

    this.items.push(item);
    return true;
  }
}

export function mergeSolution(
  a: TabCompletionSolution,
  b: TabCompletionSolution,
) {
  if (a.context.hash !== b.context.hash) {
    throw new Error("Cannot merge solutions with different contexts.");
  }

  const solution = new TabCompletionSolution(a.context);
  for (const item of [...a.items, ...b.items]) {
    if (
      !solution.items.some((i) => i.target.getText() === item.target.getText())
    ) {
      solution.items.push(item);
    }
  }

  return solution;
}
