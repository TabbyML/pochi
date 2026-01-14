import { ArrayWindow } from "./array-window";

export type LatencyStatistics = {
  values: readonly number[];
  metrics: {
    total: number;
    timeouts: number;
    responses: number;
    averageResponseTime: number;
  };
};

const DefaultWindowSize = 10;

export class LatencyTracker {
  private windowSize: number;
  private latencies: ArrayWindow<number>;

  constructor(options?: { windowSize: number }) {
    this.windowSize = options?.windowSize ?? DefaultWindowSize;
    this.latencies = new ArrayWindow<number>(this.windowSize);
  }

  // add a latency entry, add NaN for timeouts
  add(entry: number): void {
    this.latencies.add(entry);
  }

  reset(): void {
    this.latencies = new ArrayWindow<number>(this.windowSize);
  }

  calculateLatencyStatistics(): LatencyStatistics {
    const latencies = this.latencies.getValues();
    const timeouts = latencies.filter((latency) => Number.isNaN(latency));
    const responses = latencies.filter((latency) => !Number.isNaN(latency));
    const averageResponseTime =
      responses.length > 0
        ? responses.reduce((acc, latency) => acc + latency, 0) /
          responses.length
        : 0;
    return {
      values: latencies,
      metrics: {
        total: latencies.length,
        timeouts: timeouts.length,
        responses: responses.length,
        averageResponseTime,
      },
    };
  }
}

export function analyzeMetrics(
  latencyStatistics: LatencyStatistics,
): "healthy" | "highTimeoutRate" | "slowResponseTime" | null {
  const rules = {
    // Mark status as healthy if the latency is less than the threshold for each latest windowSize requests.
    healthy: { windowSize: 1, latency: 3000 },
    // If there is at least {count} requests, and the average response time is higher than the {latency}, show warning
    slowResponseTime: { latency: 5000, count: 1 },
    // If there is at least {count} timeouts, and the timeout rate is higher than the {rate}, show warning
    highTimeoutRate: { rate: 0.5, count: 1 },
  };

  const {
    values: latencies,
    metrics: { total, timeouts, responses, averageResponseTime },
  } = latencyStatistics;

  if (
    latencies
      .slice(-Math.min(latencies.length, rules.healthy.windowSize))
      .every((latency) => latency < rules.healthy.latency)
  ) {
    return "healthy";
  }
  if (
    timeouts / total > rules.highTimeoutRate.rate &&
    timeouts >= rules.highTimeoutRate.count
  ) {
    return "highTimeoutRate";
  }
  if (
    averageResponseTime > rules.slowResponseTime.latency &&
    responses >= rules.slowResponseTime.count
  ) {
    return "slowResponseTime";
  }
  return null;
}
