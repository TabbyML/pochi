import * as path from "node:path";

const imageExtensionToMimeType: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".ico": "image/vnd.microsoft.icon",
  ".avif": "image/avif",
  ".heic": "image/heic",
};

const videoExtensionToMimeType: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".m4v": "video/x-m4v",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
};

const audioExtensionToMimeType: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".wma": "audio/x-ms-wma",
};

const documentExtensionToMimeType: Record<string, string> = {
  ".pdf": "application/pdf",
};

const mediaExtensionToMimeType: Record<string, string> = {
  ...imageExtensionToMimeType,
  ...videoExtensionToMimeType,
  ...audioExtensionToMimeType,
  ...documentExtensionToMimeType,
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
  const mimeType = mediaExtensionToMimeType[extension];
  if (!mimeType) {
    throw new Error(`Unsupported media file extension: ${extension}`);
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
