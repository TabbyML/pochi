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

export const MaxImageSizeBytes = 20 * 1024 * 1024;

export type ImageContentResult = {
  type: "image";
  data: string;
  mimeType: string;
  isTruncated: boolean;
};

export function getImageMimeType(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  return imageExtensionToMimeType[extension];
}

export function isSupportedImageFile(filePath: string): boolean {
  return getImageMimeType(filePath) !== undefined;
}

export function bufferToBase64(buffer: Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

export function buildImageContent(
  filePath: string,
  fileBuffer: Uint8Array,
  supportedMimeTypes?: string[],
): ImageContentResult | undefined {
  const mimeType = getImageMimeType(filePath);
  if (!mimeType) return undefined;

  if (supportedMimeTypes && !supportedMimeTypes.includes(mimeType)) {
    return undefined;
  }

  let data = fileBuffer;
  let isTruncated = false;

  if (fileBuffer.byteLength > MaxImageSizeBytes) {
    data = fileBuffer.slice(0, MaxImageSizeBytes);
    isTruncated = true;
  }

  return {
    type: "image" as const,
    data: bufferToBase64(data),
    mimeType,
    isTruncated,
  };
}
