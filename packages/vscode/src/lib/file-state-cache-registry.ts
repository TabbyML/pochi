import {
  FileStateCache,
  type RecentFileState,
  isVirtualPath,
  resolvePath,
} from "@getpochi/common/tool-utils";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class FileStateCacheRegistry implements vscode.Disposable {
  private readonly caches = new Map<string, FileStateCache>();

  get(taskId: string): FileStateCache {
    let cache = this.caches.get(taskId);
    if (!cache) {
      cache = new FileStateCache();
      this.caches.set(taskId, cache);
    }
    return cache;
  }

  copyIfAbsent(sourceTaskId: string, targetTaskId: string): void {
    const existingTarget = this.caches.get(targetTaskId);
    if (existingTarget && existingTarget.size > 0) {
      return;
    }

    const source = this.caches.get(sourceTaskId);
    const target = existingTarget ?? new FileStateCache();
    if (source) {
      for (const [key, value] of source) {
        target.set(key, { ...value });
      }
      const history = source.getReadHistorySnapshot();
      if (history.hydrated) {
        target.hydrateReadHistory(history.paths);
      } else {
        for (const filePath of history.paths) {
          target.recordRead(filePath);
        }
      }
    }
    if (!existingTarget) {
      this.caches.set(targetTaskId, target);
    }
  }

  markAllAsWritten(taskId: string): void {
    this.caches.get(taskId)?.markAllAsWritten();
  }

  hydrateReadHistory(taskId: string, paths: string[], cwd: string): void {
    this.get(taskId).hydrateReadHistory(
      paths
        .filter((filePath) => !isVirtualPath(filePath))
        .map((filePath) => resolvePath(filePath, cwd)),
    );
  }

  getRecentFiles(taskId: string): RecentFileState[] {
    return this.caches.get(taskId)?.getRecentFiles() ?? [];
  }

  delete(taskId: string): void {
    const cache = this.caches.get(taskId);
    cache?.clear();
    this.caches.delete(taskId);
  }

  has(taskId: string): boolean {
    return this.caches.has(taskId);
  }

  dispose(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
    this.caches.clear();
  }
}
