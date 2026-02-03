import uFuzzy from "@leeoniya/ufuzzy";

const MaxResult = 500;

// Create a single uFuzzy instance to reuse
const uf = new uFuzzy({
  // Allow @ symbols and basic path characters
  intraChars: "[a-z\\d'@\\-_./]",
  // Don't split on forward slashes - treat them as regular characters
  interSplit: "[^a-zA-Z\\d'@\\-_./]+",
  // Allow more insertions for path matching (like amp -> amp-07-08-2025)
  intraIns: 5,
});

/**
 * Generic fuzzy search function that works with any string array
 */
export function fuzzySearchStrings(needle: string, haystack: string[]) {
  const [idxs, info, order] = uf.search(haystack, needle);
  if (!order) {
    if (idxs !== null) {
      return idxs.map((idx) => ({ idx, range: null }));
    }
    return [];
  }

  return order.map((i) => ({
    idx: idxs[i],
    range: info.ranges[i],
  }));
}

/**
 * Fuzzy search function for objects with id properties
 */
export function fuzzySearchSlashCandidates<T extends { id: string }>(
  needle: string | undefined,
  data: T[],
  limit: number = MaxResult,
): T[] {
  if (!data || !Array.isArray(data)) {
    return [];
  }

  if (!needle) {
    return data.slice(0, limit);
  }

  // Create a haystack of names for searching
  const haystack = data.map((w) => w.id);
  const [_, info, order] = uf.search(haystack, needle);

  if (!order) return [];

  const results = [];
  for (const i of order) {
    const item = data[info.idx[i]];
    results.push(item);
  }

  return results;
}

type FileItem = { filepath: string; isDir: boolean };

/**
 * Enhanced fuzzy search for files with active tabs prioritization
 */
export function fuzzySearchFiles(
  needle: string | undefined,
  data: {
    files: FileItem[];
    activeTabs: FileItem[];
  },
  limit = MaxResult,
): { filepath: string; isDir: boolean }[] {
  if (!needle) {
    return mergeUniqueFileItems(data.activeTabs, data.files).slice(0, limit);
  }

  const activeTabSearchResult = fuzzySearchStrings(
    needle,
    data.activeTabs.map((x) => x.filepath) || [],
  );

  const fileSearchResult = fuzzySearchStrings(
    needle,
    data.files.map((x) => x.filepath),
  );

  return mergeUniqueFileItems(
    activeTabSearchResult.map(({ idx }) => data.activeTabs[idx]),
    fileSearchResult.map(({ idx }) => data.files[idx]),
  ).slice(0, limit);
}

function mergeUniqueFileItems(...items: FileItem[][]): FileItem[] {
  const result: FileItem[] = [];
  const processedFilepath = new Set<string>();
  for (const x of items) {
    for (const y of x) {
      if (!processedFilepath.has(y.filepath)) {
        result.push(y);
        processedFilepath.add(y.filepath);
      }
    }
  }

  return result;
}
