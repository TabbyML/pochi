import * as path from "node:path";

const imageExtensionToMimeType: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".ico": "image/vnd.microsoft.icon",
  ".avif": "image/avif",
  ".heic": "image/heic",
};

const MaxMediaSizeBytes = 20 * 1024 * 1024; // 20MB

type MediaContentResult = {
  type: "media";
  data: string;
  mimeType: string;
  isTruncated: boolean;
};

export function readMediaFile(
  filePath: string,
  fileBuffer: Uint8Array,
  supportedMimeTypes: string[],
): MediaContentResult {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = imageExtensionToMimeType[extension];
  if (!mimeType) {
    throw new Error(`Unsupported image file extension: ${extension}`);
  }

  if (!supportedMimeTypes.includes(mimeType)) {
    throw new Error(`MIME type ${mimeType} is not supported.`);
  }

  let data = fileBuffer;
  let isTruncated = false;

  if (fileBuffer.byteLength > MaxMediaSizeBytes) {
    data = fileBuffer.slice(0, MaxMediaSizeBytes);
    isTruncated = true;
  }

  return {
    type: "media" as const,
    data: Buffer.from(data).toString("base64"),
    mimeType,
    isTruncated,
  };
}
