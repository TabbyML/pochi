import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "@commander-js/extra-typings";
import { prompts } from "@getpochi/common";
import { type BlobStore, fileToUri } from "@getpochi/livekit";
import type { FileUIPart, TextUIPart } from "ai";

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
