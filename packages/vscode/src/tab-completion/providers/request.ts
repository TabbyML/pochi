import { type Signal, signal } from "@preact/signals-core";
import * as vscode from "vscode";
import type { TabCompletionContext } from "../context";
import { AbortError, type LatencyTracker, isTimeoutError } from "../utils";
import type {
  TabCompletionProviderClient,
  TabCompletionProviderResponseItem,
} from "./types";

export type TabCompletionProviderRequestStatus =
  | TabCompletionProviderRequestStatusInit
  | TabCompletionProviderRequestStatusProcessing
  | TabCompletionProviderRequestStatusFinished
  | TabCompletionProviderRequestStatusError;

export interface TabCompletionProviderRequestStatusInit {
  readonly type: "init";
  readonly estimatedResponseTime: number;
}

export interface TabCompletionProviderRequestStatusProcessing {
  readonly type: "processing";
}

export interface TabCompletionProviderRequestStatusFinished {
  readonly type: "finished";
  readonly response: TabCompletionProviderResponseItem | undefined;
}

export interface TabCompletionProviderRequestStatusError {
  readonly type: "error";
  readonly error: Error;
}

export class TabCompletionProviderRequest implements vscode.Disposable {
  readonly status: Signal<TabCompletionProviderRequestStatus>;

  private baseSegments: NonNullable<unknown> | undefined;
  private extraSegments: NonNullable<unknown> | undefined;
  private contextCollectingCancellationTokenSource:
    | vscode.CancellationTokenSource
    | undefined;
  private fetchingCancellationTokenSource:
    | vscode.CancellationTokenSource
    | undefined;

  constructor(
    public readonly context: TabCompletionContext,
    private readonly client: TabCompletionProviderClient<object, object>,
    private readonly latencyTracker: LatencyTracker,
  ) {
    const estimatedResponseTime =
      latencyTracker.calculateLatencyStatistics().metrics.averageResponseTime;
    this.status = signal({
      type: "init",
      estimatedResponseTime,
    });
    this.collectSegments();
  }

  private async collectSegments() {
    this.baseSegments = this.client.collectBaseSegments(this.context);
    if (!this.baseSegments) {
      return;
    }

    if (this.contextCollectingCancellationTokenSource) {
      this.contextCollectingCancellationTokenSource.cancel();
      this.contextCollectingCancellationTokenSource = undefined;
    }
    const tokenSource = new vscode.CancellationTokenSource();
    this.contextCollectingCancellationTokenSource = tokenSource;
    try {
      this.extraSegments = await this.client.collectExtraSegments(
        this.context,
        this.baseSegments,
        tokenSource.token,
      );
    } catch (error) {
      this.extraSegments = undefined;
    } finally {
      tokenSource.dispose();
      if (this.contextCollectingCancellationTokenSource === tokenSource) {
        this.contextCollectingCancellationTokenSource = undefined;
      }
    }
  }

  async start(token?: vscode.CancellationToken) {
    if (this.contextCollectingCancellationTokenSource) {
      this.contextCollectingCancellationTokenSource.cancel();
      this.contextCollectingCancellationTokenSource = undefined;
    }

    if (token?.isCancellationRequested) {
      this.status.value = {
        type: "error",
        error: new AbortError(),
      };
      return;
    }

    if (!this.baseSegments) {
      this.status.value = {
        type: "finished",
        response: undefined,
      };
      return;
    }

    if (this.fetchingCancellationTokenSource) {
      this.fetchingCancellationTokenSource.cancel();
      this.fetchingCancellationTokenSource = undefined;
    }
    const tokenSource = new vscode.CancellationTokenSource();
    if (token) {
      token.onCancellationRequested(() => tokenSource.cancel());
    }
    this.fetchingCancellationTokenSource = tokenSource;

    this.status.value = {
      type: "processing",
    };
    const requestStartedAt = performance.now();
    try {
      const response = await this.client.fetchCompletion(
        this.context,
        this.baseSegments,
        this.extraSegments,
        tokenSource.token,
      );
      const latency = performance.now() - requestStartedAt;
      this.latencyTracker.add(latency);

      this.status.value = {
        type: "finished",
        response,
      };
    } catch (error) {
      if (isTimeoutError(error)) {
        this.latencyTracker.add(Number.NaN);
      }
      this.status.value = {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      tokenSource.dispose();
      if (this.fetchingCancellationTokenSource === tokenSource) {
        this.fetchingCancellationTokenSource = undefined;
      }
    }
  }

  dispose() {
    if (this.contextCollectingCancellationTokenSource) {
      this.contextCollectingCancellationTokenSource.cancel();
      this.contextCollectingCancellationTokenSource = undefined;
    }
    if (this.fetchingCancellationTokenSource) {
      this.fetchingCancellationTokenSource.cancel();
      this.fetchingCancellationTokenSource = undefined;
    }
  }
}
