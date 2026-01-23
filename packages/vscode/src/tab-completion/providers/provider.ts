import type { TabCompletionContext } from "../context";
import { LatencyTracker } from "../utils";
import { TabCompletionProviderRequest } from "./request";
import type { TabCompletionProviderClient } from "./types";

export class TabCompletionProvider {
  private latencyTracker = new LatencyTracker();
  private nextRequestId = 0;

  constructor(readonly client: TabCompletionProviderClient<object, object>) {}

  createRequest(
    context: TabCompletionContext,
  ): TabCompletionProviderRequest | undefined {
    if (!this.client) {
      return undefined;
    }

    this.nextRequestId++;
    const requestId = `${this.client.id}-${this.nextRequestId}`;

    return new TabCompletionProviderRequest(
      requestId,
      context,
      this.client,
      this.latencyTracker,
    );
  }
}
