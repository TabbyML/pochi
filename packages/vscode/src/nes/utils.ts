import type { TextContentChange } from "./types";

export function applyEdit(original: string, changes: TextContentChange[]) {
  const sortedChanges = changes.toSorted((a, b) => {
    return a.rangeOffset - b.rangeOffset;
  });
  let text = "";
  let index = 0;
  for (const changes of sortedChanges) {
    text += original.slice(index, changes.rangeOffset) + changes.text;
    index = changes.rangeOffset + changes.rangeLength;
  }
  text += original.slice(index);
  return text;
}
