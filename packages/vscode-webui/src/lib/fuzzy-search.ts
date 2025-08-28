import uFuzzy from "@leeoniya/ufuzzy";

const MaxResult = 500;

// Create a single uFuzzy instance to reuse
const ufInstance = new uFuzzy({
  // Allow @ symbols and basic path characters
  intraChars: "[a-z\\d'@\\-_./]",
  // Don't split on forward slashes - treat them as regular characters
  interSplit: "[^a-zA-Z\\d'@\\-_./]+",
  // Allow more insertions for path matching (like amp -> amp-07-08-2025)
  intraIns: 20,
});

export interface FuzzySearchOptions {
  maxResults?: number;
}

/**
 * Generic fuzzy search function that works with any string array
 */
export function fuzzySearchStrings(
  needle: string | undefined,
  haystack: string[],
  options: FuzzySearchOptions = {},
): string[] {
  if (!haystack || !Array.isArray(haystack)) {
    return [];
  }

  if (!needle) {
    const maxResults = options.maxResults ?? MaxResult;
    return haystack.slice(0, maxResults);
  }

  const [_, info, order] = ufInstance.search(haystack, needle);

  if (!order) return [];

  const results: string[] = [];
  for (const i of order) {
    const name = haystack[info.idx[i]];
    results.push(name);
  }

  return results;
}

/**
 * Fuzzy search function for workflow objects with name and content properties
 */
export function fuzzySearchWorkflows<T extends { id: string }>(
  needle: string | undefined,
  workflows: T[],
  options: FuzzySearchOptions = {},
): T[] {
  if (!workflows || !Array.isArray(workflows)) {
    return [];
  }

  if (!needle) {
    const maxResults = options.maxResults ?? MaxResult;
    return workflows.slice(0, maxResults);
  }

  // Create a haystack of workflow names for searching
  const haystack = workflows.map((w) => w.id);
  const [_, info, order] = ufInstance.search(haystack, needle);

  if (!order) return [];

  const results = [];
  for (const i of order) {
    const workflow = workflows[info.idx[i]];
    results.push(workflow);
  }

  return results;
}

/**
 * Enhanced fuzzy search for files with active tabs prioritization
 */
export function fuzzySearchFiles(
  needle: string | undefined,
  data: {
    haystack: string[];
    files: { filepath: string; isDir: boolean }[];
    activeTabs?: { filepath: string; isDir: boolean }[];
  },
  options: FuzzySearchOptions = {},
): { filepath: string; isDir: boolean }[] {
  const activeTabsSet = new Set(data.activeTabs?.map((d) => d.filepath) || []);

  const uniqueFilesMap = new Map<
    string,
    { filepath: string; isDir: boolean }
  >();

  for (const file of data.files) {
    uniqueFilesMap.set(file.filepath, file);
  }

  if (data.activeTabs) {
    for (const tab of data.activeTabs) {
      uniqueFilesMap.set(tab.filepath, tab);
    }
  }

  if (!needle) {
    const maxResults = options.maxResults ?? MaxResult;
    const allResults = Array.from(uniqueFilesMap.values());
    return sortResultsByActiveTabs(allResults, activeTabsSet).slice(
      0,
      maxResults,
    );
  }

  const allFilepaths = new Set(data.haystack);

  if (data.activeTabs) {
    for (const tab of data.activeTabs) {
      allFilepaths.add(tab.filepath);
    }
  }

  const searchResults = fuzzySearchStrings(
    needle,
    Array.from(allFilepaths),
    options,
  );

  const searchResultsMap = new Map<
    string,
    { filepath: string; isDir: boolean }
  >();

  for (const filepath of searchResults) {
    const file = uniqueFilesMap.get(filepath);
    if (file) {
      searchResultsMap.set(filepath, file);
    }
  }

  return sortResultsByActiveTabs(
    Array.from(searchResultsMap.values()),
    activeTabsSet,
  );
}

function sortResultsByActiveTabs<T extends { filepath: string }>(
  results: T[],
  activeTabsSet: Set<string>,
): T[] {
  const activeResults: T[] = [];
  const normalResults: T[] = [];

  for (const result of results) {
    if (activeTabsSet.has(result.filepath)) {
      activeResults.push(result);
    } else {
      normalResults.push(result);
    }
  }

  return [...activeResults, ...normalResults];
}
