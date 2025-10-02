import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useStoreBlobUrl } from "@/lib/store-blob";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import type React from "react";

interface CopyableImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  mimeType?: string;
  filename?: string;
}

const imageUrlToBase64 = async (url: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise<string>((onSuccess, onError) => {
    try {
      const reader = new FileReader();
      reader.onload = function () {
        onSuccess(
          (this.result as string).replace(/^data:image\/(.*);base64,/, ""),
        );
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      onError(e);
    }
  });
};

export function CopyableImage({
  src,
  alt,
  className,
  mimeType,
  filename,
  ...props
}: CopyableImageProps) {
  const url = useStoreBlobUrl(src ?? "");

  if (!url) return null;

  const handleCopy = async (e?: React.ClipboardEvent) => {
    e?.preventDefault();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
    } catch (err) {
      console.error("Failed to copy image: ", err);
    }
  };

  const handleClick = async () => {
    if (!isVSCodeEnvironment()) return;
    const data = await imageUrlToBase64(url);
    const extension = mimeType?.split("/")[1] || "png";
    const finalFilename =
      filename || `image-preview-${Date.now()}.${extension}`;
    vscodeHost.openFile(finalFilename, {
      base64Data: data,
    });
  };

  return (
    <div onCopy={handleCopy}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              isVSCodeEnvironment() && "cursor-pointer hover:opacity-80",
            )}
            onClick={handleClick}
          >
            {/* biome-ignore lint/a11y/useAltText: alt is passed in props */}
            <img
              src={url}
              className={cn("h-auto w-full", className)}
              {...props}
            />
          </div>
        </ContextMenuTrigger>
        {isVSCodeEnvironment() && (
          <ContextMenuContent>
            <ContextMenuItem onClick={() => handleCopy()}>
              Copy Image
            </ContextMenuItem>
            <ContextMenuItem onClick={handleClick}>Open Image</ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
    </div>
  );
}
