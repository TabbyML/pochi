import * as path from "node:path";
import type { IFileState, IFileStateCache } from "@getpochi/tools";
import { getLogger } from "../base/logger";
import { resolvePath } from "./fs";

const logger = getLogger("FileStateCache");

export const FILE_UNCHANGED_STUB =
  "File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current — refer to that instead of re-reading.";

type FileCacheCallbackResult<T> = {
  result: T;
  /** Model-visible content to store in cache. Pass null to skip caching (e.g. actual binary content). */
  fileCacheContent: string | null;
  /** Whether the result sent to the model was truncated. */
  fileCacheIsTruncated?: boolean;
};

export type RecentFileState = {
  path: string;
  content: string;
  timestamp: number;
  startLine: number | undefined;
  endLine: number | undefined;
  isTruncated?: boolean;
};

/** Default maximum number of entries in the cache */
const DEFAULT_MAX_ENTRIES = 100;
/** Default maximum total size of cached content in bytes (25 MB) */
const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * LRU cache that tracks what file content the model has "seen".
 *
 * this serves three purposes:
 *
 * 1. **Read deduplication**: When a file is read again with the same range and
 *    unchanged mtime, the tool returns a "file_unchanged" stub instead of the
 *    full content, saving tokens.
 *
 * 2. **Edit/Write staleness guard**: Before applying an edit or writing a file,
 *    the tool checks that the file hasn't been modified externally since the
 *    model last read it (by comparing the current mtime with the cached timestamp).
 *
 * 3. **Post-write cache update**: After a successful edit or write, the cache
 *    is updated with the new content and mtime so subsequent reads can dedup.
 *
 * The cache uses an LRU eviction policy with both entry-count and byte-size limits.
 */
export class FileStateCache {
  private readonly entries: Map<string, IFileState> = new Map();
  private currentSizeBytes = 0;

  /**
   * Normalize the file path used as cache key.
   * Resolves `..`, `.`, and duplicate separators so that different
   * representations of the same file hit the same cache entry.
   */
  private normalizeKey(key: string): string {
    return path.normalize(key);
  }

  get(key: string): IFileState | undefined {
    const normalized = this.normalizeKey(key);
    const entry = this.entries.get(normalized);
    if (!entry) return undefined;

    // Move to end (most-recently-used) by re-inserting
    this.entries.delete(normalized);
    this.entries.set(normalized, entry);
    return entry;
  }

  set(key: string, value: IFileState): void {
    const normalized = this.normalizeKey(key);

    // If key already exists, subtract its old size
    const existing = this.entries.get(normalized);
    if (existing) {
      this.currentSizeBytes -= Buffer.byteLength(existing.content);
      this.entries.delete(normalized);
    }

    const newSize = Buffer.byteLength(value.content);

    // Skip caching oversized entries because they can never fit within the cap.
    if (newSize > DEFAULT_MAX_SIZE_BYTES) {
      return;
    }

    // Evict LRU entries until we have room
    this.evict(newSize);

    this.entries.set(normalized, value);
    this.currentSizeBytes += newSize;
  }

  has(key: string): boolean {
    return this.entries.has(this.normalizeKey(key));
  }

  delete(key: string): boolean {
    const normalized = this.normalizeKey(key);
    const entry = this.entries.get(normalized);
    if (entry) {
      this.currentSizeBytes -= Buffer.byteLength(entry.content);
      return this.entries.delete(normalized);
    }
    return false;
  }

  clear(): void {
    this.entries.clear();
    this.currentSizeBytes = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get sizeBytes(): number {
    return this.currentSizeBytes;
  }

  *keys(): IterableIterator<string> {
    yield* this.entries.keys();
  }

  *values(): IterableIterator<IFileState> {
    yield* this.entries.values();
  }

  getRecentFiles(maxFiles = 5): RecentFileState[] {
    const entries: Array<[string, IFileState]> = [];
    this.entries.forEach((state, path) => {
      entries.push([path, state]);
    });

    return entries
      .reverse()
      .slice(0, maxFiles)
      .map(([path, state]) => ({
        path,
        content: state.content,
        timestamp: state.timestamp,
        startLine: state.startLine,
        endLine: state.endLine,
        isTruncated: state.isTruncated,
      }));
  }

  *[Symbol.iterator](): IterableIterator<[string, IFileState]> {
    yield* this.entries;
  }

  /**
   * Evict least-recently-used entries until we have room for `newBytes`
   * and are within the max entry count.
   */
  private evict(newBytes: number): void {
    // Evict while over entry count limit (reserve 1 slot for the new entry)
    while (this.entries.size >= DEFAULT_MAX_ENTRIES) {
      this.evictOldest();
    }
    // Evict while over byte size limit
    while (
      this.currentSizeBytes + newBytes > DEFAULT_MAX_SIZE_BYTES &&
      this.entries.size > 0
    ) {
      this.evictOldest();
    }
  }

  private evictOldest(): void {
    // Map iterates in insertion order; the first key is the LRU entry
    const oldest = this.entries.keys().next();
    if (!oldest.done) {
      const entry = this.entries.get(oldest.value);
      if (entry) {
        this.currentSizeBytes -= Buffer.byteLength(entry.content);
      }
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * Check if a file has been modified externally since the model last read it.
 * Throws an error if the file is stale, preventing silent data loss during
 * edit/write operations.
 *
 * @param cache - The FileStateCache to check against
 * @param resolvedPath - Absolute path of the file
 * @param getMtime - Platform-specific function to get current file mtime
 * @param operation - "editing" or "writing" — used in error message
 */
export async function checkStaleness(
  cache: IFileStateCache,
  resolvedPath: string,
  getMtime: (path: string) => Promise<number | undefined>,
  operation: "editing" | "writing" = "editing",
): Promise<void> {
  const cachedState = cache.get(resolvedPath);

  if (!cachedState) {
    // The model hasn't read this file yet.
    // If the file exists on disk, require the model to read it first to avoid
    // blindly overwriting content it has never seen.
    const currentMtime = await getMtime(resolvedPath);
    if (currentMtime !== undefined) {
      throw new Error(
        `File has not been read yet. Please read the file before ${operation} it.`,
      );
    }
    // File doesn't exist on disk — creating a new file is always allowed.
    return;
  }

  const currentMtime = await getMtime(resolvedPath);
  if (currentMtime === cachedState.timestamp) return;

  const actualMtime =
    currentMtime === undefined ? "missing" : String(currentMtime);
  throw new Error(
    `File has been modified since it was last read (expected mtime ${cachedState.timestamp}, got ${actualMtime}). Please read the file again before ${operation}.`,
  );
}

/**
 * Update the cache after a successful edit or write operation.
 * Sets startLine/endLine to undefined so this entry won't trigger
 * false read-dedup matches (only read-sourced entries can do that).
 *
 * @param cache - The FileStateCache to update
 * @param resolvedPath - Absolute path of the file
 * @param content - The new file content after edit/write
 * @param getMtime - Platform-specific function to get current file mtime
 */
export async function updateCacheAfterWrite(
  cache: IFileStateCache,
  resolvedPath: string,
  content: string,
  getMtime: (path: string) => Promise<number | undefined>,
): Promise<void> {
  const newMtime = await getMtime(resolvedPath);
  if (newMtime !== undefined) {
    cache.set(resolvedPath, {
      content,
      timestamp: newMtime,
      startLine: undefined,
      endLine: undefined,
      fromWrite: true,
    });
  }
}

/**
 * Wraps a file-editing callback with staleness guard (before) and cache
 * update (after).  This eliminates the boilerplate that was previously
 * copy-pasted across applyDiff, writeToFile, and editNotebook in both
 * CLI and VSCode tool implementations.
 *
 * Path resolution and virtual-path detection are handled automatically:
 * `pochi://` URIs are passed through as-is and skip all cache operations,
 * while regular paths are resolved against `cwd`.
 *
 * @param opts.cache        - The file state cache (may be undefined; if so, the guard/update are skipped)
 * @param opts.path         - Raw path from the tool input (may be relative or a `pochi://` URI)
 * @param opts.cwd          - Working directory used to resolve relative paths
 * @param opts.getMtime     - Platform-specific function to get current file mtime
 * @param opts.operation    - "editing" or "writing" — used in the staleness error message
 * @param opts.doWork       - Callback that performs the actual edit/write. Receives the resolved
 *                            absolute path and returns `{ result, fileCacheContent }`.
 * @returns The `result` value produced by `doWork`
 */
export async function withFileStateCacheGuard<T>(opts: {
  cache: IFileStateCache | undefined;
  path: string;
  cwd: string;
  getMtime: (path: string) => Promise<number | undefined>;
  operation: "editing" | "writing";
  doWork: (resolvedPath: string) => Promise<FileCacheCallbackResult<T>>;
}): Promise<T> {
  const { cache, path: inputPath, cwd, getMtime, operation, doWork } = opts;

  const isVirtual = isVirtualPath(inputPath);
  const resolvedPath = isVirtual ? inputPath : resolvePath(inputPath, cwd);

  // --- Staleness guard ---
  if (!isVirtual && cache) {
    await checkStaleness(cache, resolvedPath, getMtime, operation);
  }

  const { result, fileCacheContent } = await doWork(resolvedPath);

  // --- Update cache with new content ---
  if (!isVirtual && cache && fileCacheContent !== null) {
    await updateCacheAfterWrite(
      cache,
      resolvedPath,
      fileCacheContent,
      getMtime,
    );
  }

  return result;
}

/**
 * Detect whether a path is a virtual `pochi://` URI.
 * Used internally by cache wrappers to skip caching for virtual file systems.
 */
export function isVirtualPath(path: string): boolean {
  return path.startsWith("pochi://");
}

/**
 * Wraps a readFile implementation with cache deduplication (before) and cache
 * population (after).  This eliminates the duplicate read-dedup + cache-populate
 * boilerplate from both CLI and VSCode readFile tools.
 *
 * Path resolution and virtual-path detection are handled automatically:
 * `pochi://` URIs are passed through as-is and skip all cache operations,
 * while regular paths are resolved against `cwd`.
 *
 * @param opts.cache          - The file state cache (may be undefined; if so, caching is skipped)
 * @param opts.path           - Raw path from the tool input (may be relative or a `pochi://` URI)
 * @param opts.cwd            - Working directory used to resolve relative paths
 * @param opts.startLine      - 1-indexed start line requested by the model
 * @param opts.endLine        - 1-indexed end line requested by the model
 * @param opts.getMtime       - Platform-specific function to get current file mtime
 * @param opts.doRead         - Callback that performs the actual file read. Receives the resolved
 *                              absolute path. Returns the result plus the content to store in cache.
 *                              If `skipCache` is true the result is not cached (e.g. actual binary).
 * @returns The read result — either a deduplicated sentinel or the result of `doRead`
 */
export async function withReadFileCache<T>(opts: {
  cache: IFileStateCache | undefined;
  path: string;
  cwd: string;
  startLine: number | undefined;
  endLine: number | undefined;
  getMtime: (path: string) => Promise<number | undefined>;
  doRead: (resolvedPath: string) => Promise<FileCacheCallbackResult<T>>;
}): Promise<{ result: T; deduplicated: false } | { deduplicated: true }> {
  const {
    cache,
    path: inputPath,
    cwd,
    startLine,
    endLine,
    getMtime,
    doRead,
  } = opts;

  const isVirtual = isVirtualPath(inputPath);
  const resolvedPath = isVirtual ? inputPath : resolvePath(inputPath, cwd);
  const shouldCache = !isVirtual && cache;

  logger.debug(
    `withReadFileCache: path="${inputPath}" resolvedPath="${resolvedPath}" isVirtual=${isVirtual} cacheExists=${!!cache} shouldCache=${!!shouldCache} startLine=${startLine} endLine=${endLine}`,
  );

  // --- Read deduplication ---
  // If we've already read this exact file + range and it hasn't been
  // modified on disk, return a "deduplicated" sentinel so the caller
  // can return a lightweight FILE_UNCHANGED_STUB instead of re-sending
  // the full content (saves tokens).
  if (shouldCache) {
    const existingState = cache.get(resolvedPath);
    logger.debug(
      `withReadFileCache: existingState=${existingState ? `{startLine=${existingState.startLine}, endLine=${existingState.endLine}, timestamp=${existingState.timestamp}}` : "undefined"}`,
    );
    if (
      existingState &&
      !existingState.fromWrite &&
      existingState.startLine === startLine &&
      existingState.endLine === endLine
    ) {
      const mtimeMs = await getMtime(resolvedPath);
      logger.debug(
        `withReadFileCache: range match, currentMtime=${mtimeMs} cachedMtime=${existingState.timestamp} match=${mtimeMs === existingState.timestamp}`,
      );
      if (mtimeMs !== undefined && mtimeMs === existingState.timestamp) {
        logger.debug(`withReadFileCache: DEDUPLICATED for "${resolvedPath}"`);
        return { deduplicated: true };
      }
    }
  }

  const { result, fileCacheContent, fileCacheIsTruncated } =
    await doRead(resolvedPath);

  // --- Populate cache ---
  // Store what the model has "seen" so that future reads can dedup,
  // and edit/write tools can detect external modifications.
  // fileCacheContent === null means the doRead served actual binary content —
  // nothing the model "sees" as text, so skip caching.
  if (shouldCache && fileCacheContent !== null) {
    const mtimeMs = await getMtime(resolvedPath);
    logger.debug(
      `withReadFileCache: populating cache for "${resolvedPath}" mtime=${mtimeMs} contentLen=${fileCacheContent.length}`,
    );
    if (mtimeMs !== undefined) {
      cache.set(resolvedPath, {
        content: fileCacheContent,
        timestamp: mtimeMs,
        startLine,
        endLine,
        isTruncated: fileCacheIsTruncated,
      });
    }
  }

  return { result, deduplicated: false };
}
