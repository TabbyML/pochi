import { signal } from "@preact/signals-core";
import type { FinishReason } from "ai";
import z from "zod";

export const StepMetadataEntry = z.object({
  taskId: z.string(),
  messageId: z.string(),
  stepIndex: z.number(),

  hasError: z.boolean(),

  startedAt: z.custom<Date>().optional(),
  finishedAt: z.custom<Date>().optional(),
  duration: z.number().optional(),

  metadata: z.object({
    finishReason: z.custom<FinishReason>(),
    totalTokens: z.number(),
  }),
});
export type StepMetadataEntry = z.infer<typeof StepMetadataEntry>;

// FIXME(zhiming): remove StepMetadataTracker in the next version
export class StepMetadataTracker {
  readonly entries = signal<StepMetadataEntry[]>([]);

  trackStep(entry: StepMetadataEntry) {
    this.entries.value = [...this.entries.value, entry];
  }
}
