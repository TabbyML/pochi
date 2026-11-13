import { isToolUIPart } from "ai";
import type { Message } from "../types";

export type LineChanges = { added: number; removed: number };

/**
 * Sums the line changes reported by file-editing tool calls
 * (`output._meta.editSummary`) across a task's messages.
 *
 * Each tool call reports the diff of that single edit, so the result is the
 * total number of lines Pochi edited, not the net change of the working tree:
 * editing the same lines twice counts twice, and changes made by shell
 * commands or by the user are not included.
 */
export function computeLineChanges(messages: Message[]): LineChanges {
  let added = 0;
  let removed = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue;
      const editSummary = getEditSummary(part.output);
      if (!editSummary) continue;
      added += editSummary.added;
      removed += editSummary.removed;
    }
  }
  return { added, removed };
}

function getEditSummary(output: unknown): LineChanges | undefined {
  if (typeof output !== "object" || output === null) return;
  const meta = (output as { _meta?: unknown })._meta;
  if (typeof meta !== "object" || meta === null) return;
  const editSummary = (meta as { editSummary?: unknown }).editSummary;
  if (typeof editSummary !== "object" || editSummary === null) return;
  const { added, removed } = editSummary as {
    added?: unknown;
    removed?: unknown;
  };
  if (!isCount(added) || !isCount(removed)) return;
  return { added, removed };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
