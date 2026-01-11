import type * as vscode from "vscode";
import { ArrayWindow } from "./utils";

const BaseIntervalSlideWindowAvg = {
  minSize: 10,
  maxSize: 100,
  min: 100,
  max: 400,
};
const AdaptiveRate = {
  min: 1.5,
  max: 3.0,
};
const ContextScoreWeights = {
  triggerCharacter: 0.5,
  lineEnd: 0.4,
  documentEnd: 0.1,
};
const RequestDelay = {
  min: 100, // ms
  max: 1000,
};

export class TabCompletionDebounce {
  private baseInterval = 200; // ms
  private lastTimestamp = 0;
  private intervalHistory = new ArrayWindow<number>(
    BaseIntervalSlideWindowAvg.maxSize,
  );

  trigger() {
    const now = Date.now();
    const interval = now - this.lastTimestamp;
    this.lastTimestamp = now;
    if (
      interval < BaseIntervalSlideWindowAvg.min ||
      interval > BaseIntervalSlideWindowAvg.max
    ) {
      return;
    }
    this.intervalHistory.add(interval);
    const values = this.intervalHistory.getValues();
    if (values.length > BaseIntervalSlideWindowAvg.minSize) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      this.baseInterval = clamp(
        BaseIntervalSlideWindowAvg.min,
        BaseIntervalSlideWindowAvg.max,
        avg,
      );
    }
  }

  getDelay(params: {
    triggerCharacter: string;
    isLineEnd?: boolean;
    isDocumentEnd?: boolean;
    isManually?: boolean;
    estimatedResponseTime?: number;
    token?: vscode.CancellationToken | undefined;
  }): number {
    if (params.isManually) {
      return 0;
    }
    const contextScore = calcContextScore(params);
    const adaptiveRate =
      AdaptiveRate.max - (AdaptiveRate.max - AdaptiveRate.min) * contextScore;
    const expectedLatency = adaptiveRate * this.baseInterval;
    const responseTime = params.estimatedResponseTime ?? 0;
    const delay = clamp(
      RequestDelay.min,
      RequestDelay.max,
      expectedLatency - responseTime,
    );
    return delay;
  }
}

// return score in [0, 1], 1 means the context has a high chance to accept the completion
function calcContextScore(params: {
  triggerCharacter: string;
  isLineEnd?: boolean;
  isDocumentEnd?: boolean;
}): number {
  const { triggerCharacter, isLineEnd, isDocumentEnd } = params;
  const weights = ContextScoreWeights;
  let score = 0;
  score += triggerCharacter.match(/^\W*$/) ? weights.triggerCharacter : 0;
  score += isLineEnd ? weights.lineEnd : 0;
  score += isDocumentEnd ? weights.documentEnd : 0;
  score = clamp(0, 1, score);
  return score;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}
