import { FileBadge } from "@/features/tools";
import { useReviews } from "@/lib/hooks/use-reviews";
import { cn } from "@/lib/utils";
import type { Review } from "@getpochi/common/vscode-webui-bridge";
import { MessageSquare } from "lucide-react";
import { useMemo } from "react";

export const ReviewBadges: React.FC = () => {
  const reviews = useReviews();

  const groupedReviews = useMemo(() => {
    const groupMap = new Map<string, Review[]>();

    for (const review of reviews) {
      const existing = groupMap.get(review.uri);
      if (existing) {
        existing.push(review);
      } else {
        groupMap.set(review.uri, [review]);
      }
    }

    const result: Array<{ uri: string; reviews: Review[] }> = [];
    for (const [uri, reviewsForUri] of groupMap) {
      result.push({ uri, reviews: reviewsForUri });
    }

    return result;
  }, [reviews]);

  return (
    <>
      {groupedReviews.map((x) => {
        const reviewsLen = x.reviews.length;
        return (
          <div
            key={x.uri}
            className={cn(
              "inline-flex h-[1.7rem] max-w-full items-center gap-1 overflow-hidden truncate rounded-sm",
            )}
          >
            <FileBadge
              className="hover:!bg-transparent !py-0 m-0 cursor-default truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] pr-1"
              labelClassName="whitespace-nowrap"
              label={getBadgeLabel(x.uri)}
              path={x.uri}
            >
              <span className="ml-1 space-x-0.5">
                <MessageSquare className="inline size-3" />
                {reviewsLen > 1 && (
                  <span className="text-muted-foreground text-xs">
                    {reviewsLen}
                  </span>
                )}
              </span>
            </FileBadge>
          </div>
        );
      })}
    </>
  );
};

// Build label for the badge
function getBadgeLabel(reviewUri: string) {
  const filename = reviewUri.split("/").pop();

  return filename;
}
