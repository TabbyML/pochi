import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "@commander-js/extra-typings";
import { prompts } from "@getpochi/common";
import { type BlobStore, fileToUri } from "@getpochi/livekit";
import type { FileUIPart, TextUIPart } from "ai";

/**
 * Processes a list of file attachments (local or remote URLs) for a CLI task.
 * Converts local files to data URIs stored in the BlobStore, resolves mime types
 * for remote files (including special handling for YouTube video URLs), and generates
 * system reminders and file parts for the AI model's prompt.
 *
 * @param attachments Array of file paths or remote URLs representing the attachments.
 * @param blobStore Storage backend for uploading and managing media content.
 * @param program Commander CLI Command instance used to report fatal attachment errors.
 * @returns A promise resolving to an array of prompt parts (text reminders and file attachments).
 */
export async function processAttachments(
  attachments: string[],
  blobStore: BlobStore,
  program: Command,
): Promise<(TextUIPart | FileUIPart)[]> {
  const parts: (TextUIPart | FileUIPart)[] = [];

  if (attachments && attachments.length > 0) {
    for (const attachmentPath of attachments) {
      try {
        const isRemoteUrl = isUrl(attachmentPath);
        let dataUrl: string;
        let mimeType: string;
        let filename: string;

        if (isRemoteUrl) {
          //TODO: Large video URLs now do not cause OOM, but will still not be completed by the assistant
          //TODO: Follow up fix is needed to fix this issue.
          dataUrl = attachmentPath;
          filename = path.basename(new URL(attachmentPath).pathname);

          // Special handling for YouTube URLs
          if (
            attachmentPath.match(
              /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/,
            )
          ) {
            mimeType = "video/mp4"; // Treat YouTube as video
          } else {
            // Try to get mime type from HEAD request
            try {
              const response = await fetch(attachmentPath, {
                method: "HEAD",
              });
              const contentType = response.headers.get("content-type");
              if (contentType) {
                mimeType = contentType.split(";")[0].trim();
              } else {
                // Fallback to extension if no content-type header
                mimeType = getMimeType(new URL(attachmentPath).pathname);
              }
            } catch (e) {
              // Fallback to extension if fetch fails
              mimeType = getMimeType(new URL(attachmentPath).pathname);
            }
          }
        } else {
          const absolutePath = path.resolve(process.cwd(), attachmentPath);
          const buffer = await fs.readFile(absolutePath);
          mimeType = getMimeType(attachmentPath);
          filename = path.basename(absolutePath);
          dataUrl = await fileToUri(
            blobStore,
            new File([buffer], attachmentPath, {
              type: mimeType,
            }),
          );
        }

        parts.push({
          type: "text",
          text: prompts.createSystemReminder(
            `Attached file: ${
              isRemoteUrl
                ? attachmentPath
                : path.relative(process.cwd(), attachmentPath)
            }`,
          ),
        });
        parts.push({
          type: "file",
          mediaType: mimeType,
          filename,
          url: dataUrl,
        } satisfies FileUIPart);
      } catch (error) {
        program.error(`Failed to read attachment: ${attachmentPath}\n${error}`);
      }
    }
  }

  return parts;
}

/**
 * Derives the mime type of a file based on its file extension.
 * Defaults to "application/octet-stream" if the extension is unknown.
 *
 * @param filePath Path or URL of the file.
 * @returns The resolved mime type string.
 */
function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    default:
      return "application/octet-stream";
  }
}

/**
 * Checks if a given string is a valid URL and represents a remote protocol (e.g. http, https, gs).
 * Excludes "file:" protocol URLs as they refer to local files.
 *
 * @param str The string path or URL to check.
 * @returns True if the string is a remote URL, false otherwise.
 */
function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    // Allow http, https, gs, and other remote protocols
    // Exclude file:// protocol as those are local paths
    return url.protocol !== "file:";
  } catch {
    return false;
  }
}
