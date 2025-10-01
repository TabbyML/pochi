import { LRUCache } from "lru-cache";
import type { NESResponseItem } from "./types";

export class NESCache extends LRUCache<string, NESResponseItem> {
  constructor(options?: { max?: number; ttl?: number }) {
    const max = options?.max ?? 100;
    const ttl = options?.ttl ?? 5 * 60 * 1000; // 5 minutes
    super({
      max,
      ttl,
    });
  }
}
