import { BrowserSessionStore } from "@getpochi/common/browser";

/**
 * Creates a BrowserSessionStore instance configured for VSCode environment
 * @returns Configured BrowserSessionStore instance
 */
export function createBrowserSessionStore(): BrowserSessionStore {
  return new BrowserSessionStore();
}
