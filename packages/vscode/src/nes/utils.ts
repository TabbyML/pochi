import type { TextContentChange } from "./types";

export function applyEdit(original: string, changes: TextContentChange[]) {
  const sortedChanges = changes.toSorted((a, b) => {
    return a.rangeOffset - b.rangeOffset;
  });
  let text = "";
  let index = 0;
  for (const change of sortedChanges) {
    text += original.slice(index, change.rangeOffset) + change.text;
    index = change.rangeOffset + change.rangeLength;
  }
  text += original.slice(index);
  return text;
}
