import type { TextContentChange } from "./types";

export function applyEdit(
  original: string,
  changes: readonly TextContentChange[],
): {
  text: string;
  editedRanges: {
    offset: number;
    length: number;
  }[];
} {
  const sortedChanges = changes.toSorted((a, b) => {
    return a.rangeOffset - b.rangeOffset;
  });
  let text = "";
  let originalIndex = 0;
  let editedIndex = 0;
  const editedRanges: {
    offset: number;
    length: number;
  }[] = [];
  for (const change of sortedChanges) {
    const unchangedText = original.slice(originalIndex, change.rangeOffset);
    text += unchangedText + change.text;
    const rangeStartOffset = editedIndex + unchangedText.length;
    editedRanges.push({
      offset: rangeStartOffset,
      length: change.text.length,
    });
    originalIndex = change.rangeOffset + change.rangeLength;
    editedIndex = rangeStartOffset + change.text.length;
  }
  text += original.slice(originalIndex);
  return { text, editedRanges };
}
