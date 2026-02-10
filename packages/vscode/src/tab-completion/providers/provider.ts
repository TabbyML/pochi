import { type Signal, signal } from "@preact/signals-core";
import type * as vscode from "vscode";
import type { TabCompletionContext } from "../context";
import { LatencyTracker, isCanceledError, isTimeoutError } from "../utils";
import { TabCompletionProviderRequest } from "./request";
import type { TabCompletionProviderClient } from "./types";

export class TabCompletionProvider implements vscode.Disposable {
  private latencyTracker = new LatencyTracker();
  private nextRequestId = 0;
  private disposables: vscode.Disposable[] = [];

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

    const request = new TabCompletionProviderRequest(
      requestId,
      context,
      this.client,
      this.latencyTracker,
    );
    const disposable = {
      dispose: request.status.subscribe((status) => {
        if (
          status.type === "error" &&
          status.error &&
          !(isTimeoutError(status.error) || isCanceledError(status.error))
        ) {
          this.error.value = status.error.message;
        } else if (status.type === "finished") {
          this.error.value = undefined;
        }
      }),
    };
    this.disposables.push(disposable);

    return request;
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
