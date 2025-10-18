import mime from "mime";

const MaxMediaSizeBytes = 20 * 1024 * 1024; // 20MB

type MediaContentResult = {
  type: "media";
  data: string;
  mimeType: string;
};

export function readMediaFile(
  filePath: string,
  fileBuffer: Uint8Array,
  contentType: string[],
): MediaContentResult {
  const mimeType = mime.getType(filePath);
  if (!mimeType) {
    throw new Error(`Unsupported media file ${filePath}`);
  }

  if (!isSupportedMimeType(mimeType, contentType)) {
    throw new Error(`MIME type ${mimeType} is not supported.`);
  }

  if (fileBuffer.byteLength > MaxMediaSizeBytes) {
    throw new Error(`Media file ${filePath} is too large. Max size is 20 MB.`);
  }

  return {
    type: "media" as const,
    data: Buffer.from(fileBuffer).toString("base64"),
    mimeType,
  };
}

const isSupportedMimeType = (
  mimeType: string,
  contentType: string[],
): boolean => {
  const normalizedTypes = contentType.map((type) => type.toLowerCase());

  // Check for exact match
  if (normalizedTypes.includes(mimeType)) {
    return true;
  }

  // Check for wildcard patterns (e.g., "image/*", "video/*")
  for (const pattern of normalizedTypes) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      if (mimeType.startsWith(`${prefix}/`)) {
        return true;
      }
    }
  }

  return false;
};
