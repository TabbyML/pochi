import { describe, expect, it } from "vitest";
import {
  type FilesLine,
  type MessageMetadataLine,
  type MessagePartLine,
  getFingerprint,
} from "../trajectory-types";

function messagePartLine(
  overrides: Partial<MessagePartLine> = {},
): MessagePartLine {
  return {
    type: "message-part",
    timestamp: new Date("2024-01-01T00:00:00.000Z"),
    messageId: "msg-1",
    role: "user",
    index: 0,
    part: { type: "text", text: "hello" },
    ...overrides,
  };
}

function messageMetadataLine(
  overrides: Partial<MessageMetadataLine> = {},
): MessageMetadataLine {
  return {
    type: "message-metadata",
    messageId: "msg-1",
    role: "user",
    metadata: { kind: "user" },
    ...overrides,
  } as MessageMetadataLine;
}

function filesLine(overrides: Partial<FilesLine> = {}): FilesLine {
  return {
    type: "files",
    files: [],
    ...overrides,
  };
}

describe("getFingerprint", () => {
  describe("message-part", () => {
    it("includes the messageId and index prefix", () => {
      const fingerprint = getFingerprint(
        messagePartLine({ messageId: "msg-1", index: 2 }),
      );
      expect(fingerprint).toMatch(/^message-part:msg-1:2:[0-9a-f]{16}$/);
    });

    it("produces identical fingerprints for identical parts", () => {
      const a = getFingerprint(messagePartLine());
      const b = getFingerprint(messagePartLine());
      expect(a).toBe(b);
    });

    it("produces different fingerprints when the part content differs", () => {
      const a = getFingerprint(
        messagePartLine({ part: { type: "text", text: "hello" } }),
      );
      const b = getFingerprint(
        messagePartLine({ part: { type: "text", text: "world" } }),
      );
      expect(a).not.toBe(b);
    });

    it("produces different fingerprints when the messageId differs", () => {
      const a = getFingerprint(messagePartLine({ messageId: "msg-1" }));
      const b = getFingerprint(messagePartLine({ messageId: "msg-2" }));
      expect(a).not.toBe(b);
    });

    it("produces different fingerprints when the index differs", () => {
      const a = getFingerprint(messagePartLine({ index: 0 }));
      const b = getFingerprint(messagePartLine({ index: 1 }));
      expect(a).not.toBe(b);
    });

    it("is not affected by keys with undefined values in the part", () => {
      const a = getFingerprint(
        messagePartLine({
          part: { type: "text", text: "hello" } as MessagePartLine["part"],
        }),
      );
      const b = getFingerprint(
        messagePartLine({
          part: {
            type: "text",
            text: "hello",
            state: undefined,
          } as MessagePartLine["part"],
        }),
      );
      expect(a).toBe(b);
    });
  });

  describe("message-metadata", () => {
    it("includes the messageId prefix", () => {
      const fingerprint = getFingerprint(
        messageMetadataLine({ messageId: "msg-1" }),
      );
      expect(fingerprint).toMatch(/^message-metadata:msg-1:[0-9a-f]{16}$/);
    });

    it("produces identical fingerprints for identical metadata", () => {
      const a = getFingerprint(messageMetadataLine());
      const b = getFingerprint(messageMetadataLine());
      expect(a).toBe(b);
    });

    it("produces different fingerprints when the metadata differs", () => {
      const a = getFingerprint(
        messageMetadataLine({ metadata: { kind: "user" } }),
      );
      const b = getFingerprint(
        messageMetadataLine({ metadata: { kind: "user", compact: true } }),
      );
      expect(a).not.toBe(b);
    });

    it("treats a missing metadata field the same as an empty object", () => {
      const a = getFingerprint(
        messageMetadataLine({ metadata: undefined } as never),
      );
      const b = getFingerprint(messageMetadataLine({ metadata: {} } as never));
      expect(a).toBe(b);
    });

    it("is not affected by keys with undefined values in the metadata", () => {
      const a = getFingerprint(
        messageMetadataLine({ metadata: { kind: "user" } }),
      );
      const b = getFingerprint(
        messageMetadataLine({
          metadata: { kind: "user", compact: undefined } as never,
        }),
      );
      expect(a).toBe(b);
    });
  });

  describe("files", () => {
    it("uses the 'files:' prefix", () => {
      const fingerprint = getFingerprint(filesLine());
      expect(fingerprint).toMatch(/^files:[0-9a-f]{16}$/);
    });

    it("produces identical fingerprints for identical file lists", () => {
      const file = { filePath: "a.ts", content: "a" };
      const a = getFingerprint(filesLine({ files: [file] }));
      const b = getFingerprint(filesLine({ files: [file] }));
      expect(a).toBe(b);
    });

    it("produces different fingerprints when the file list differs", () => {
      const a = getFingerprint(
        filesLine({ files: [{ filePath: "a.ts", content: "a" }] }),
      );
      const b = getFingerprint(
        filesLine({ files: [{ filePath: "b.ts", content: "b" }] }),
      );
      expect(a).not.toBe(b);
    });
  });
});
