import { describe, expect, it } from "vitest";
import {
  MaxImageSizeBytes,
  buildImageContent,
  getImageMimeType,
  isSupportedImageFile,
} from "../media";


describe("media utils", () => {
  it("detects supported image extensions", () => {
    expect(isSupportedImageFile("/tmp/sample.png")).toBe(true);
    expect(isSupportedImageFile("/tmp/sample.txt")).toBe(false);
  });

  it("returns the expected mime type", () => {
    expect(getImageMimeType("icon.svg")).toBe("image/svg+xml");
    expect(getImageMimeType("README.md")).toBeUndefined();
  });

  it("builds image content payloads", () => {
    const buffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const payload = buildImageContent("asset.png", buffer);
    expect(payload).toEqual({
      type: "image",
      mimeType: "image/png",
      data: "3q2+7w==",
      isTruncated: false,
    });  });

  it("truncates image content when it exceeds the maximum size", () => {
    const largeBuffer = Buffer.alloc(MaxImageSizeBytes + 1, 0xff);
    const result = buildImageContent("oversized.png", largeBuffer);
    expect(result?.isTruncated).toBe(true);
    expect(Buffer.from(result?.data ?? "", "base64").byteLength).toBe(
      MaxImageSizeBytes,
    );
  });
});
