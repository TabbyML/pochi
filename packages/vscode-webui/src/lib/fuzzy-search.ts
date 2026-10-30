import uFuzzy from "@leeoniya/ufuzzy";

const MaxResult = 500;

// Create a single uFuzzy instance to reuse.
// uFuzzy defaults to Latin-only regexps, which treat CJK/accented characters as
// term separators, so those file names can never be matched. Treat every
// non-ascii code unit as a regular term character instead, except surrogates:
// uFuzzy matches per code unit, so the halves of a character outside the BMP
// could drift apart and match unrelated characters. Such characters stay
// separators and are ignored by the search.
const uf = new uFuzzy({
  // Allow @ symbols, basic path characters and any non-ascii BMP character
  intraChars: "[a-z\\d'@\\-_./\\u0080-\\ud7ff\\ue000-\\uffff]",
  // Don't split on forward slashes - treat them as regular characters
  interSplit: "[^a-zA-Z\\d'@\\-_./\\u0080-\\ud7ff\\ue000-\\uffff]+",
  // Allow more insertions for path matching (like amp -> amp-07-08-2025)
  intraIns: 5,
});

/**
 * Generic fuzzy search function that works with any string array
 */
export function fuzzySearchStrings(
  needle: string,
  haystack: string[],
  outOfOrder = 0,
) {
  const [idxs, info, order] = uf.search(haystack, needle, outOfOrder);
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

const MaxTaskResult = 10;
// Task titles are sentences: let the words of the needle match in any order.
const MaxTaskOutOfOrderTerms = 5;
// Shorter id prefixes would match too many unrelated tasks.
const MinTaskIdQueryLength = 4;

/**
 * Fuzzy search past tasks by title, or by an id prefix such as the short id
 * shown in the task tab title. Id matches come first. Without a needle the most
 * recent tasks are returned; `tasks` is expected to be sorted by recency already.
 */
export function fuzzySearchTasks<T extends { taskId?: string; title?: string }>(
  needle: string | undefined,
  tasks: T[],
  limit = MaxTaskResult,
): T[] {
  const trimmed = needle?.trim();
  if (!trimmed) return tasks.slice(0, limit);

  const idQuery = trimmed.toLowerCase();
  const idMatches =
    idQuery.length >= MinTaskIdQueryLength
      ? tasks.filter((task) => task.taskId?.toLowerCase().startsWith(idQuery))
      : [];

  const titleMatches = fuzzySearchStrings(
    trimmed,
    tasks.map((task) => task.title ?? ""),
    MaxTaskOutOfOrderTerms,
  ).map(({ idx }) => tasks[idx]);

  return [...new Set([...idMatches, ...titleMatches])].slice(0, limit);
}
