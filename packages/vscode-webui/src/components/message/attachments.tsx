import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { FileUIPart } from "ai";
import { FileIcon as LucideFileIcon, VideoIcon } from "lucide-react";
import { FileIcon } from "../tool-invocation/file-icon/file-icon";

interface MessageAttachmentsProps {
  attachments: FileUIPart[];
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="my-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        const isImage = attachment.mediaType?.startsWith("image/");
        const isVideo = attachment.mediaType?.startsWith("video/");
        const isPdf = attachment.mediaType === "application/pdf";

        return (
          <HoverCard key={index} openDelay={300} closeDelay={200}>
            <div className="relative">
              <HoverCardTrigger asChild>
                <div
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded border border-[var(--vscode-editorWidget-background)] bg-[var(--vscode-editorWidget-background)] p-1.5 text-xs hover:border-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)]",
                  )}
                >
                  {isImage ? (
                    <>
                      <div className="h-5 w-5 overflow-hidden rounded-sm border border-[var(--vscode-input-border)]">
                        <img
                          src={attachment.url}
                          alt={attachment.filename}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="max-w-[100px] truncate">
                        {attachment.filename}
                      </span>
                    </>
                  ) : isPdf ? (
                    <>
                      <FileIcon
                        path={attachment.filename || "file.pdf"}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="max-w-[100px] truncate">
                        {attachment.filename}
                      </span>
                    </>
                  ) : isVideo ? (
                    <>
                      <VideoIcon className="h-4 w-4 shrink-0 text-[var(--vscode-symbolIcon-fileForeground)]" />
                      <span className="max-w-[100px] truncate">
                        {attachment.filename}
                      </span>
                    </>
                  ) : (
                    <>
                      <LucideFileIcon className="h-4 w-4 shrink-0 text-[var(--vscode-symbolIcon-fileForeground)]" />
                      <span className="max-w-[100px] truncate">
                        {attachment.filename}
                      </span>
                    </>
                  )}
                </div>
              </HoverCardTrigger>
            </div>

            <HoverCardContent
              className="max-h-[80vh] w-auto max-w-[95vw] p-2"
              align="start"
            >
              <div className="flex flex-col gap-2">
                <div className="max-w-[300px] truncate font-medium text-xs">
                  {attachment.filename}
                </div>
                {isImage ? (
                  <div className="overflow-hidden rounded-md border border-[var(--vscode-input-border)]">
                    <img
                      src={attachment.url}
                      alt={attachment.filename}
                      className="h-auto max-w-[90vw] object-contain"
                      style={{
                        maxHeight: "calc(60vh - 1rem)",
                        minWidth: "200px",
                      }}
                    />
                  </div>
                ) : isVideo ? (
                  <video
                    src={attachment.url}
                    controls
                    className="h-auto max-w-[90vw] object-contain"
                    style={{
                      maxHeight: "calc(60vh - 1rem)",
                      minWidth: "200px",
                    }}
                  >
                    <track kind="captions" />
                  </video>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <FileIcon
                      path={attachment.filename || "file"}
                      className="h-5 w-5"
                    />
                    <span>{attachment.mediaType}</span>
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}
