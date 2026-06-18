import type { File, Message } from "@getpochi/livekit";
import z from "zod";
import { StepMetadataEntry } from "../lib/step-metadata-tracker";

export const MessagePartLine = z.object({
  type: z.literal("message-part"),
  timestamp: z.coerce.date(),
  messageId: z.string(),
  role: z.custom<Message["role"]>(),
  index: z.number(),
  part: z.custom<Message["parts"][number]>(),
});
export type MessagePartLine = z.infer<typeof MessagePartLine>;

export const MessageMetadataLine = z.object({
  type: z.literal("message-metadata"),
  messageId: z.string(),
  role: z.custom<Message["role"]>(),
  metadata: z.custom<Message["metadata"]>(),
});
export type MessageMetadataLine = z.infer<typeof MessageMetadataLine>;

export const StepMetadataLine = StepMetadataEntry.extend({
  type: z.literal("step-metadata"),
});
export type StepMetadataLine = z.infer<typeof StepMetadataLine>;

export const FilesLine = z.object({
  type: z.literal("files"),
  files: z.readonly(z.array(z.custom<File>())),
});
export type FilesLine = z.infer<typeof FilesLine>;

export const TrajectoryLine = z.discriminatedUnion("type", [
  MessagePartLine,
  MessageMetadataLine,
  StepMetadataLine,
  FilesLine,
]);
export type TrajectoryLine = z.infer<typeof TrajectoryLine>;
