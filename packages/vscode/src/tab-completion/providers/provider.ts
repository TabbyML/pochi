import { type Signal, signal } from "@preact/signals-core";
import type * as vscode from "vscode";
import type { TabCompletionContext } from "../context";
import { LatencyTracker } from "../utils";
import { TabCompletionProviderRequest } from "./request";
import type { TabCompletionProviderClient } from "./types";

export class TabCompletionProvider implements vscode.Disposable {
  private latencyTracker = new LatencyTracker();
  private nextRequestId = 0;

  readonly error: Signal<string | undefined> = signal(undefined);

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

  updateError(error: string | undefined) {
    this.error.value = error;
  }

  clearError() {
    this.error.value = undefined;
  }

  dispose() {
    this.error.value = undefined;
  }
}
