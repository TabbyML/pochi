import { getLogger } from "@/lib/logger";
import type { NESRequestContext } from "@/nes/contexts";
import type { TextContentChange } from "@/nes/types";

const logger = getLogger("NES.Solution.Filters.TextDuplication");

export function checkTextDuplication(
  context: NESRequestContext,
  change: TextContentChange,
): boolean {
  const newText = change.text;
  const contextText =
    context.promptSegments.prefix +
    context.promptSegments.editableRegionPrefix +
    context.promptSegments.editableRegionSuffix +
    context.promptSegments.suffix;

  if (newText.length > 3 && contextText.includes(newText)) {
    logger.debug(
      `Detected duplicate text: "${newText}" already exists in the context text.`,
    );
    return true;
  }
  return false;
}
