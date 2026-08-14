import { getLogger } from "@/lib/logger";
import {
  type MonitorEventEnvelope,
  MonitorRateLimitedReason,
  MonitorWatcher,
} from "@getpochi/common";
import { type Signal, signal } from "@preact/signals-core";
import type { TerminalJobMonitorHooks } from "../terminal/terminal-job";
import { TerminalJob } from "../terminal/terminal-job";

const logger = getLogger("MonitorRegistry");

export interface CreateMonitorOptions {
  taskId: string;
  description: string;
  /** Watch deadline. `undefined` means no timeout (persistent monitor). */
  timeoutMs?: number;
}

export interface MonitorHandle {
  /** Hooks to pass into TerminalJob.create as `monitor`. */
  hooks: TerminalJobMonitorHooks;
  /**
   * Associates the monitor with its background job id. Must be called right
   * after TerminalJob.create; no chunk can arrive before that because the
   * job first awaits shell integration.
   */
  attach(backgroundJobId: string): void;
}

/**
 * Per-task registry of undelivered monitor event batches.
 *
 * Module-level state like TerminalJob/OutputManager's static registries,
 * because a VSCodeHostImpl exists per webview (sidebar and panels) while
 * monitors are process-wide.
 */
const taskSignals = new Map<string, Signal<MonitorEventEnvelope[]>>();
/** Active (not yet ended) monitors: backgroundJobId -> description. */
const activeMonitors = new Map<string, string>();
const changeListeners = new Set<() => void>();
let eventSeq = 0;

function emitChange(): void {
  for (const listener of changeListeners) listener();
}

/** The undelivered event batches of a task, as a live signal. */
function monitorEvents(taskId: string): Signal<MonitorEventEnvelope[]> {
  let events = taskSignals.get(taskId);
  if (!events) {
    events = signal<MonitorEventEnvelope[]>([]);
    taskSignals.set(taskId, events);
  }
  return events;
}

/** Drops delivered batches with seq <= upToSeq. */
function ackMonitorEvents(taskId: string, upToSeq: number): void {
  const events = taskSignals.get(taskId);
  if (!events) return;
  events.value = events.value.filter((e) => e.seq > upToSeq);
}

function deleteMonitorEvents(taskId: string): void {
  taskSignals.delete(taskId);
}

function createMonitor(options: CreateMonitorOptions): MonitorHandle {
  const { taskId, description, timeoutMs } = options;
  let backgroundJobId: string | undefined;
  let ended = false;
  // The kill initiated by timeout / rate limiting surfaces in TerminalJob as
  // a generic "terminal closed" error; this override preserves the real cause.
  let endReasonOverride: string | undefined;

  const push = (envelope: Omit<MonitorEventEnvelope, "seq">) => {
    const events = monitorEvents(taskId);
    events.value = [...events.value, { ...envelope, seq: ++eventSeq }];
  };

  const kill = () => {
    if (backgroundJobId) {
      TerminalJob.get(backgroundJobId)?.kill();
    }
  };

  const watcher = new MonitorWatcher({
    onEvents: (lines) => {
      push({
        backgroundJobId: backgroundJobId ?? "unknown",
        description,
        lines,
      });
    },
    onTimeout: () => {
      logger.debug(`Monitor timeout, killing job ${backgroundJobId}`);
      endReasonOverride = "killed after timeout";
      kill();
    },
    onRateLimitExceeded: () => {
      logger.debug(`Monitor rate limited, killing job ${backgroundJobId}`);
      endReasonOverride = MonitorRateLimitedReason;
      kill();
    },
    timeoutMs,
  });

  return {
    hooks: {
      ingest: (chunk) => watcher.ingest(chunk),
      end: (reason) => {
        if (ended) return;
        ended = true;
        if (backgroundJobId) {
          activeMonitors.delete(backgroundJobId);
          emitChange();
        }
        watcher.end();
        push({
          backgroundJobId: backgroundJobId ?? "unknown",
          description,
          lines: [],
          ended: { reason: endReasonOverride ?? reason },
        });
      },
    },
    attach: (id) => {
      backgroundJobId = id;
      activeMonitors.set(id, description);
      emitChange();
    },
  };
}

export const MonitorRegistry = {
  events: monitorEvents,
  ack: ackMonitorEvents,
  delete: deleteMonitorEvents,
  createMonitor,
  onDidChange: (listener: () => void): { dispose(): void } => {
    changeListeners.add(listener);
    return { dispose: () => changeListeners.delete(listener) };
  },
  descriptionFor: (backgroundJobId: string): string | undefined =>
    activeMonitors.get(backgroundJobId),
};
