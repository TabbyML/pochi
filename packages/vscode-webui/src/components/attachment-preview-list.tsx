import { FileIcon } from "@/components/tool-invocation/file-icon/file-icon";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { Loader2, Play, Video, X } from "lucide-react";
import { useEffect, useState } from "react";

interface AttachmentPreviewListProps {
  files: File[];
  onRemove: (index: number) => void;
  isUploading: boolean;
}

export function AttachmentPreviewList({
  files,
  onRemove,
  isUploading,
}: AttachmentPreviewListProps) {
  const [previews, setPreviews] = useState<string[]>([]);

  // Generate previews for attachments when files change
  useEffect(() => {
    let active = true;
    const generatedUrls: string[] = [];

    const generatePreviews = async () => {
      const newPreviews = await Promise.all(
        files.map(async (file) => {
          if (file.type.startsWith("image/")) {
            const url = URL.createObjectURL(file);
            generatedUrls.push(url);
            return url;
          }
          if (file.type.startsWith("video/")) {
            try {
              return await new Promise<string>((resolve) => {
                const videoUrl = URL.createObjectURL(file);
                generatedUrls.push(videoUrl); // Keep track for full video playback
                const video = document.createElement("video");
                video.src = videoUrl;
                video.muted = true;

                const cleanup = () => {
                  video.removeEventListener("seeked", onSeeked);
                  video.removeEventListener("error", onError);
                  video.removeEventListener("loadeddata", onLoadedData);
                };

                const onSeeked = () => {
                  const canvas = document.createElement("canvas");
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL("image/jpeg");
                    generatedUrls.push(dataUrl);
                    resolve(dataUrl);
                  } else {
                    resolve("");
                  }
                  cleanup();
                };

                const onError = () => {
                  resolve("");
                  cleanup();
                };

                const onLoadedData = () => {
                  video.currentTime = 0; // Seek to the first frame
                };

                video.addEventListener("loadeddata", onLoadedData);
                video.addEventListener("seeked", onSeeked);
                video.addEventListener("error", onError);
              });
            } catch (e) {
              return "";
            }
          }
          return ""; // No preview for non-image/video files
        }),
      );
      if (active) {
        setPreviews(newPreviews);
      }
    };

    generatePreviews();

    // Cleanup function to revoke URLs when component unmounts or files change
    return () => {
      active = false;
      for (const url of generatedUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [files]);

  if (files.length === 0) return null;

  return (
    <div className="mt-2 mb-3 flex flex-wrap gap-2">
      {files.map((file, index) => {
        const previewUrl = previews[index];
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        const isPdf = file.type === "application/pdf";

        return (
          <HoverCard key={index} openDelay={300} closeDelay={200}>
            <div className="group relative">
              <HoverCardTrigger asChild>
                <div
                  className={cn(
                    "relative flex size-14 cursor-pointer items-center justify-center overflow-hidden rounded-md border",
                    "border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] hover:border-[var(--vscode-focusBorder)]",
                  )}
                >
                  {(isImage || (isVideo && previewUrl)) && previewUrl ? (
                    <>
                      <img
                        src={previewUrl}
                        alt={file.name}
                        className={cn(
                          "h-full w-full object-cover",
                          isUploading && "opacity-50",
                        )}
                      />
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="size-5 text-white opacity-60" />
                        </div>
                      )}
                    </>
                  ) : isVideo ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Video className="size-8 text-[var(--vscode-foreground)]" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <FileIcon
                        path={file.name}
                        className="inline-flex size-8 items-center justify-between before:text-3xl"
                      />
                    </div>
                  )}

                  {/* Overlay for uploading status */}
                  {isUploading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-30">
                      <Loader2 className="size-4 animate-spin text-white" />
                    </div>
                  )}
                </div>
              </HoverCardTrigger>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className={cn(
                  "-top-2 -right-2 absolute flex h-5 w-5 items-center justify-center rounded-full p-0.5 text-xs",
                  "bg-secondary text-secondary-foreground opacity-70 transition-opacity hover:opacity-100",
                )}
                aria-label="Remove attachment"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {isPdf ? (
              <HoverCardContent className="w-auto max-w-xs p-2">
                <div className="flex items-center gap-2">
                  <FileIcon path={file.name} className="size-8 flex-shrink-0" />
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <div className="truncate font-medium text-xs">
                      {file.name}
                    </div>
                    <div className="text-[var(--vscode-descriptionForeground)] text-xs">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            ) : (
              <HoverCardContent className="max-h-[80vh] w-auto max-w-[95vw] p-2">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="max-w-[300px] truncate font-medium text-xs">
                      {file.name}
                    </div>
                    {isUploading && (
                      <div className="flex items-center gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Uploading...</span>
                      </div>
                    )}
                  </div>

                  <div className="overflow-hidden rounded-md border border-[var(--input-border)]">
                    <div className="relative flex items-center justify-center bg-[var(--vscode-input-background)]">
                      {isImage && previewUrl && (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          className="h-auto max-w-[90vw] object-contain"
                          style={{
                            maxHeight: "calc(60vh - 1rem)",
                            minWidth: "200px",
                          }}
                        />
                      )}
                      {isVideo && (
                        <video
                          src={URL.createObjectURL(file)}
                          controls
                          className="h-auto max-w-[90vw] object-contain"
                          style={{
                            maxHeight: "calc(60vh - 1rem)",
                            minWidth: "200px",
                          }}
                        >
                          <track kind="captions" />
                        </video>
                      )}
                      {!isImage && !isVideo && (
                        <div
                          className="flex h-48 w-full items-center justify-center"
                          style={{ minWidth: "200px" }}
                        >
                          <FileIcon path={file.name} className="size-16" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-[var(--vscode-descriptionForeground)] text-xs">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </HoverCardContent>
            )}
          </HoverCard>
        );
      })}
    </div>
  );
}
