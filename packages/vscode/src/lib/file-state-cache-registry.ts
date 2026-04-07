import { FileStateCache } from "@getpochi/common/tool-utils";

const caches = new Map<string, FileStateCache>();

export function getFileStateCache(taskId: string): FileStateCache {
  let cache = caches.get(taskId);
  if (!cache) {
    cache = new FileStateCache();
    caches.set(taskId, cache);
  }
  return cache;
}

export function deleteFileStateCache(taskId: string): void {
  caches.delete(taskId);
}
