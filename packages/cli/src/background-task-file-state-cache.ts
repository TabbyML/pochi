import { FileStateCache } from "@getpochi/common/tool-utils";
import type { LiveChatKitBackgroundTaskOptions } from "@getpochi/livekit";

type CliBackgroundTaskFileStateCacheOptions = {
  parentTaskId?: string;
  parentFileStateCache?: FileStateCache;
};
type BackgroundTaskFileStateCache = NonNullable<
  LiveChatKitBackgroundTaskOptions["fileStateCache"]
>;

export class CliBackgroundTaskFileStateCache
  implements BackgroundTaskFileStateCache
{
  private readonly parentTaskId: string | undefined;
  private readonly parentFileStateCache: FileStateCache | undefined;
  private readonly fileStateCaches = new Map<string, FileStateCache>();

  constructor({
    parentTaskId,
    parentFileStateCache,
  }: CliBackgroundTaskFileStateCacheOptions) {
    this.parentTaskId = parentTaskId;
    this.parentFileStateCache = parentFileStateCache;
  }

  copy(sourceTaskId: string, targetTaskId: string) {
    const source =
      this.fileStateCaches.get(sourceTaskId) ??
      (sourceTaskId === this.parentTaskId
        ? this.parentFileStateCache
        : undefined);
    if (!source) return;

    const target = this.get(targetTaskId);
    target.clear();
    for (const [key, value] of source) {
      target.set(key, value);
    }
  }

  clear(taskId: string) {
    this.get(taskId).clear();
  }

  get(taskId: string) {
    let cache = this.fileStateCaches.get(taskId);
    if (!cache) {
      cache = new FileStateCache();
      this.fileStateCaches.set(taskId, cache);
    }
    return cache;
  }
}
