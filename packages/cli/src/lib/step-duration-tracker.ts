import { signal } from "@preact/signals-core";

export type StepDurationEntry = {
  taskId: string;
  messageId: string;
  stepIndex: number;

  hasError: boolean;
  startedAt: Date;
  finishedAt: Date;
  duration: number;
};

export class StepDurationTracker {
  readonly entries = signal<StepDurationEntry[]>([]);

  trackStep(entry: StepDurationEntry) {
    this.entries.value = [...this.entries.value, entry];
  }
}
