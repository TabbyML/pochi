import mime from "mime";

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
  const mimeType = mime.getType(filePath);
  if (!mimeType) {
    throw new Error(`Unsupported media file ${filePath}`);
  }

  if (!isSupportedMimeType(mimeType, supportedMimeTypes)) {
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

const isSupportedMimeType = (
  mimeType: string,
  supportedMimeTypes: string[],
): boolean => {
  const normalizedTypes = supportedMimeTypes.map((type) => type.toLowerCase());

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
