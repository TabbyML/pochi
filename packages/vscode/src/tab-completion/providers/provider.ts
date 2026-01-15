import type { TabCompletionContext } from "../context";
import { LatencyTracker } from "../utils";
import { TabCompletionProviderRequest } from "./request";
import type { TabCompletionProviderClient } from "./types";

export class TabCompletionProvider {
  private latencyTracker = new LatencyTracker();

  constructor(
    readonly id: string,
    readonly client: TabCompletionProviderClient<object, object>,
  ) {}

  createRequest(
    context: TabCompletionContext,
  ): TabCompletionProviderRequest | undefined {
    if (!this.client) {
      return undefined;
    }
    return new TabCompletionProviderRequest(
      context,
      this.client,
      this.latencyTracker,
    );
  }
}
