import { FileIcon } from "@/features/tools";
import { memo } from "react";
import type { MentionItem } from "./mention-list";

interface MentionPreviewProps {
  item: MentionItem;
}

/**
 * Preview component that shows detailed information about the selected mention item
 */
export const MentionPreview = memo(function MentionPreview({
  item,
}: MentionPreviewProps) {
  return (
    <div className="max-w-md rounded-md border bg-popover p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <FileIcon isDirectory={item.isDir} path={item.filepath} />
        <div className="flex-1 overflow-hidden">
          <div className="truncate font-medium text-sm">{item.filepath}</div>
          <div className="mt-1 text-muted-foreground text-xs">
            {item.isDir ? "Directory" : "File"}
          </div>
        </div>
      </div>
    </div>
  );
});
