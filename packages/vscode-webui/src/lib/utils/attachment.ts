import { MaxFileSize } from "@/lib/constants";

const ALLOWED_FILE_TYPES = ["image/", "application/pdf", "video/"];

/**
 * Validates if the provided file is a valid file within size constraints
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  const isAllowed = ALLOWED_FILE_TYPES.some((type) =>
    file.type.startsWith(type),
  );
  if (!isAllowed) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Only images, PDFs, and videos are allowed.`,
    };
  }

  if (file.size > MaxFileSize) {
    return {
      valid: false,
      error: `File "${file.name}" is too large (${(
        file.size / (1024 * 1024)
      ).toFixed(2)}MB). Maximum size is 20MB.`,
    };
  }

  return { valid: true };
}

/**
 * Creates a consistent filename for uploaded files
 */
export function createFileName(type: string): string {
  const ext = type.split("/")[1] || "bin";
  return `pasted-file-${Date.now()}.${ext}`;
}
