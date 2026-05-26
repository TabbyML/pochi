export interface FileListMatch {
  file: string;
  line?: number;
  context?: string;
  label?: string;
}

export const MaxRenderedFileListItems = 200;

export function getVisibleFileListMatches(
  matches: FileListMatch[],
  maxItems = MaxRenderedFileListItems,
) {
  const visibleMatches = matches.slice(0, maxItems);
  return {
    visibleMatches,
    hiddenCount: Math.max(matches.length - visibleMatches.length, 0),
  };
}
