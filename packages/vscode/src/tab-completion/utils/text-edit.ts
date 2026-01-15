import type { OffsetRange } from "./range";

export interface TextChange {
  range: OffsetRange;
  text: string;
}

// A TextEdit represents a single edit action.
// A TextEdit may contain multiple ranges modified. The ranges must not overlap.
export interface TextEdit {
  changes: TextChange[];
}

export function applyEdit(
  original: string,
  edit: TextEdit,
): {
  text: string;
  editedRanges: OffsetRange[];
} {
  const sortedChanges = edit.changes.toSorted((a, b) => {
    return a.range.start - b.range.start;
  });
  let text = "";
  let originalIndex = 0;
  let editedIndex = 0;
  const editedRanges: OffsetRange[] = [];
  for (const change of sortedChanges) {
    const skippedText = original.slice(originalIndex, change.range.start);
    text += skippedText + change.text;
    const editedRangeStart = editedIndex + skippedText.length;
    const editedRangeEnd = editedRangeStart + change.text.length;
    editedRanges.push({
      start: editedRangeStart,
      end: editedRangeEnd,
    });
    originalIndex = change.range.end;
    editedIndex = editedRangeEnd;
  }
  text += original.slice(originalIndex);
  return { text, editedRanges };
}
