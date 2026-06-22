import { type File, type Message, ZodMetadata } from "@getpochi/livekit";
import hashObject from "object-hash";
import z from "zod";

export const MessagePartLine = z.object({
  type: z.literal("message-part"),
  timestamp: z.coerce.date(),
  taskId: z
    .string()
    .optional()
    .describe(
      "Present only for subagent tasks; omitted for the top-level task.",
    ),
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
  metadata: ZodMetadata,
});
export type MessageMetadataLine = z.infer<typeof MessageMetadataLine>;

export const FilesLine = z.object({
  type: z.literal("files"),
  files: z.readonly(z.array(z.custom<File>())),
});
export type FilesLine = z.infer<typeof FilesLine>;

export const TrajectoryLine = z.discriminatedUnion("type", [
  MessagePartLine,
  MessageMetadataLine,
  FilesLine,
]);
export type TrajectoryLine = z.infer<typeof TrajectoryLine>;

// "message-part:${messageId}:${partIndex}:${hash}"
// "message-metadata:${messageId}:${hash}"
// "files:${hash}"
export function getFingerprint(trajLine: TrajectoryLine): string {
  if (trajLine.type === "message-part") {
    return `message-part:${trajLine.messageId}:${trajLine.index}:${hashObject(trajLine.part)}`;
  }
  if (trajLine.type === "message-metadata") {
    return `message-metadata:${trajLine.messageId}:${hashObject(trajLine.metadata ?? {})}`;
  }
  if (trajLine.type === "files") {
    return `files:${hashObject(trajLine.files)}`;
  }
  return "";
}
