import { getLogger } from "@/lib/logger";
import type { NESRequestContext } from "../contexts";
import { NESSolutionItem, type NESSolutionItemSource } from "./item";
import { isRevertingRecentEdits } from "./item-filters";

const logger = getLogger("NES.Solution");

export class NESSolution {
  public readonly items: NESSolutionItem[] = [];

  constructor(public readonly context: NESRequestContext) {}

  // return true if added, return false if denied by filters
  addItem(source: NESSolutionItemSource): boolean {
    const item = new NESSolutionItem(this.context, source);

    if (!item.valid) {
      logger.debug("Item is invalid.");
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
