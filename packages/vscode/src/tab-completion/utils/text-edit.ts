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
  offsetMap: OffsetMap;
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
  return {
    text,
    editedRanges,
    offsetMap: buildOffsetMap(
      sortedChanges.map((c) => c.range),
      editedRanges,
    ),
  };
}

export interface OffsetMap {
  getOffsetBefore: (offsetAfter: number) => number;
  getOffsetAfter: (offsetBefore: number) => number;
}

function buildOffsetMap(
  originalRanges: OffsetRange[],
  editedRanges: OffsetRange[],
): OffsetMap {
  if (originalRanges.length !== editedRanges.length) {
    throw new Error("Original and edited ranges must have the same length.");
  }

  const points: { from: number; to: number }[] = [];
  points.push({ from: 0, to: 0 });
  for (let i = 0; i < originalRanges.length; i++) {
    const originalRange = originalRanges[i];
    const editedRange = editedRanges[i];
    points.push({ from: originalRange.start, to: editedRange.start });
    points.push({ from: originalRange.end, to: editedRange.end });
  }
  points.push({ from: Number.MAX_SAFE_INTEGER, to: Number.MAX_SAFE_INTEGER });

  const getOffsetAfter = (offsetBefore: number) => {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (offsetBefore >= p1.from && offsetBefore < p2.from) {
        return Math.min(p1.to + offsetBefore - p1.from, p2.to);
      }
    }
    return offsetBefore;
  };

  const getOffsetBefore = (offsetAfter: number) => {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (offsetAfter >= p1.to && offsetAfter < p2.to) {
        return Math.min(p1.from + offsetAfter - p1.to, p2.from);
      }
    }
    return offsetAfter;
  };

  return {
    getOffsetBefore,
    getOffsetAfter,
  };
}
