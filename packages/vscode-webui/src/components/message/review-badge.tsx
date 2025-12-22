import { FileBadge } from "@/features/tools";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface ReviewBadgeProps {
  uri: string;
  reviewCount: number;
  className?: string;
  showIcon?: boolean;
  onClick?: () => void;
}

export const ReviewBadge: React.FC<ReviewBadgeProps> = ({
  uri,
  reviewCount,
  className,
  showIcon = true,
}) => {
  return (
    <div
      className={cn(
        "inline-flex h-[1.7rem] max-w-full items-center gap-1 overflow-hidden truncate rounded-sm",
        className,
      )}
    >
      <a
        href="command:workbench.action.focusCommentsPanel"
        target="_blank"
        rel="noopener noreferrer"
      >
        <FileBadge
          className="hover:!bg-transparent !py-0 m-0 cursor-default truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] pr-1"
          labelClassName="whitespace-nowrap"
          label={getBadgeLabel(uri)}
          path={uri}
        >
          {showIcon && (
            <span className="ml-1 space-x-0.5 text-muted-foreground">
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span>·</span>
              <MessageSquare className="inline size-3" />
              <span className="text-xs">{reviewCount}</span>
            </span>
          )}
        </FileBadge>
      </a>
    </div>
  );
};

// Build label for the badge
function getBadgeLabel(reviewUri: string) {
  const filename = reviewUri.split("/").pop();
  // Remove query parameters if present
  return filename?.split("?")[0];
}
