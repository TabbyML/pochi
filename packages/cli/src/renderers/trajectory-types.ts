import { createHash } from "node:crypto";
import { MessageMetadata } from "@getpochi/common";
import type { File, Message } from "@getpochi/livekit";
import { hash as stableHash } from "stable-hash-x";
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
  metadata: MessageMetadata,
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
    return `message-part:${trajLine.messageId}:${trajLine.index}:${digest(trajLine.part)}`;
  }
  if (trajLine.type === "message-metadata") {
    return `message-metadata:${trajLine.messageId}:${digest(trajLine.metadata ?? {})}`;
  }
  if (trajLine.type === "files") {
    return `files:${digest(trajLine.files)}`;
  }
  return "";
}

// Hashes a stable string representation of a value into a fixed-length hex digest.
//
// We use `stable-hash-x` instead of the previously used `object-hash` because
// `object-hash` incorporates object keys with `undefined` values into the
// resulting hash (e.g. `{ a: 1, b: undefined }` hashes differently than
// `{ a: 1 }`), which caused fingerprints to change even when the value did
// not meaningfully change. `stable-hash-x` ignores `undefined` values,
// producing the same stable string for both, so the fingerprint stays
// consistent regardless of `undefined` keys.
function digest(value: unknown): string {
  const stableString = stableHash(value);
  return createHash("sha256").update(stableString).digest("hex").slice(0, 16);
}
