import * as fs from "node:fs/promises";
import * as path from "node:path";
import { MaxReadFileSize } from "./limits";

/**
 * File validation utilities
 */
export function validateTextFile(fileBuffer: Uint8Array): void {
  if (!isPlainText(fileBuffer)) {
    throw new Error("Read binary file is not supported");
  }
}

// The number of bytes to inspect at the start of the file.
const BUFFER_MAX_LEN = 512;

/**
 * Checks if a buffer contains plain text by inspecting its first 512 bytes.
 * This logic is a simplified version of how VS Code determines if a file is binary.
 *
 * @param buffer The buffer to check.
 * @returns `true` if the buffer likely contains plain text, `false` otherwise.
 */
export function isPlainText(buffer: Uint8Array): boolean {
  const bufferData = buffer.slice(0, BUFFER_MAX_LEN);
  const bytesRead = bufferData.length;

  // If the buffer is empty, it's considered text.
  if (bytesRead === 0) {
    return true;
  }

  // --- BOM Detection ---
  // Check for Byte Order Marks (BOMs) which are strong indicators of text files.
  // UTF-16 BE: 0xFE 0xFF
  if (bytesRead >= 2 && bufferData[0] === 0xfe && bufferData[1] === 0xff) {
    return true;
  }
  // UTF-16 LE: 0xFF 0xFE
  if (bytesRead >= 2 && bufferData[0] === 0xff && bufferData[1] === 0xfe) {
    return true;
  }
  // UTF-8: 0xEF 0xBB 0xBF
  if (
    bytesRead >= 3 &&
    bufferData[0] === 0xef &&
    bufferData[1] === 0xbb &&
    bufferData[2] === 0xbf
  ) {
    return true;
  }

  // --- Null Byte Detection ---
  // Scan the buffer for null bytes (0x00). The presence of null bytes is a
  // strong indicator of a binary file, unless it's a UTF-16 encoded file.
  let containsZeroByte = false;
  let couldBeUTF16LE = true;
  let couldBeUTF16BE = true;

  for (let i = 0; i < bytesRead; i++) {
    const byte = bufferData[i];

    if (byte === 0) {
      containsZeroByte = true;
    }

    // Check for UTF-16 LE pattern (e.g., D<null>A<null>V<null>E)
    // Even-indexed bytes are non-zero, odd-indexed bytes are zero.
    if (couldBeUTF16LE) {
      if (i % 2 === 1) {
        // Odd index
        if (byte !== 0) {
          couldBeUTF16LE = false;
        }
      } else {
        // Even index
        if (byte === 0) {
          couldBeUTF16LE = false;
        }
      }
    }

    // Check for UTF-16 BE pattern (e.g., <null>D<null>A<null>V)
    // Even-indexed bytes are zero, odd-indexed bytes are non-zero.
    if (couldBeUTF16BE) {
      if (i % 2 === 1) {
        // Odd index
        if (byte === 0) {
          couldBeUTF16BE = false;
        }
      } else {
        // Even index
        if (byte !== 0) {
          couldBeUTF16BE = false;
        }
      }
    }

    // If it's definitely not UTF-16 but contains a null byte, it's binary.
    if (containsZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
      break;
    }
  }

  // If the file contains null bytes but does not match UTF-16 patterns,
  // it is considered binary.
  if (containsZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
    return false;
  }

  // If no definitive binary indicators were found, assume it's a text file.
  return true;
}

/**
 * Checks if a file is likely a plain text file by inspecting its first 512 bytes.
 * This logic is a simplified version of how VS Code determines if a file is binary.
 *
 * @param filePath The path to the file to check.
 * @returns A promise that resolves to `true` if the file is likely plain text, `false` otherwise.
 */
export async function isPlainTextFile(filePath: string): Promise<boolean> {
  // Open the file for reading.
  const handle = await fs.open(filePath, "r");

  // Read the first chunk of the file to inspect its contents.
  const buffer = Buffer.alloc(BUFFER_MAX_LEN);
  const { bytesRead } = await handle.read(buffer, 0, BUFFER_MAX_LEN, 0);

  // Close the file handle as we're done with it.
  await handle.close();

  return isPlainText(buffer.slice(0, bytesRead));
}

/**
 * Content processing utilities
 */
interface ContentProcessingOptions {
  startLine?: number;
  endLine?: number;
  addLineNumbers?: boolean;
}

interface ProcessedContent {
  type: "text";
  content: string;
  isTruncated: boolean;
}

export function selectFileContent(
  fileContent: string,
  options: ContentProcessingOptions = {},
): ProcessedContent {
  const { startLine, endLine, addLineNumbers = false } = options;
  const maxBytes = MaxReadFileSize;

  const lines = fileContent.split("\n");
  const start = startLine ? startLine - 1 : 0;
  const end = endLine ? endLine : lines.length;

  let selectedLines = lines.slice(start, end);

  if (addLineNumbers) {
    selectedLines = selectedLines.map(
      (line, index) => `${start + index + 1} | ${line}`,
    );
  }

  let content = selectedLines.join("\n");
  let isTruncated = false;

  if (Buffer.byteLength(content, "utf-8") > maxBytes) {
    content = content.slice(0, maxBytes);
    isTruncated = true;
  }

  return { type: "text" as const, content, isTruncated };
}

/**
 * Path validation utilities
 */
export function validateRelativePath(inputPath: string): void {
  if (path.isAbsolute(inputPath)) {
    throw new Error(
      `Absolute paths are not supported: ${inputPath}. Please use a relative path.`,
    );
  }
}

/**
 * Resolves a path that can be either absolute or relative.
 * If the path is absolute, returns it as-is.
 * If the path is relative, joins it with the provided working directory.
 */
export function resolvePath(inputPath: string, cwd: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(cwd, inputPath);
}

/**
 * Checks if a file exists.
 * @param filePath The path to the file to check.
 * @returns A promise that resolves to true if the file exists, false otherwise.
 */
export async function isFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
