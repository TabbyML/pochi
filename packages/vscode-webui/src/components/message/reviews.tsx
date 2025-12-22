import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import type {
  Review,
  ReviewComment,
} from "@getpochi/common/vscode-webui-bridge";
import { MessageSquare } from "lucide-react";
import { useMemo } from "react";
import { ReviewBadge } from "./review-badge";

interface Props {
  reviews: Review[];
}

export const Reviews: React.FC<Props> = ({ reviews }) => {
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

  if (reviews.length === 0) return null;

  return (
    <div className="my-2 flex flex-wrap gap-2">
      {groupedReviews.map((group) => {
        return (
          <ReviewBadgeWithHover
            key={group.uri}
            uri={group.uri}
            reviews={group.reviews}
          />
        );
      })}
    </div>
  );
};

interface ReviewBadgeWithHoverProps {
  uri: string;
  reviews: Review[];
}

function ReviewBadgeWithHover({ uri, reviews }: ReviewBadgeWithHoverProps) {
  const filePath = getFilePath(uri);

  return (
    <HoverCard openDelay={300} closeDelay={200}>
      <HoverCardTrigger asChild>
        <span>
          <ReviewBadge uri={uri} reviewCount={reviews.length} />
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        className="w-auto max-w-[80vw] p-3 sm:w-[800px]"
        align="start"
        side="bottom"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 border-[var(--vscode-editorWidget-border)] border-b pb-2 sm:flex-row sm:items-center sm:gap-2">
            <span className="truncate font-medium text-base">
              {getBadgeLabel(uri)}
            </span>
            <span className="truncate text-muted-foreground text-sm">
              {filePath}
            </span>
          </div>

          <div className="flex max-h-[400px] flex-col gap-4 overflow-y-auto">
            {reviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </div>
        </div>
      </HoverCardContent>{" "}
    </HoverCard>
  );
}

interface ReviewItemProps {
  review: Review;
}

function ReviewItem({ review }: ReviewItemProps) {
  const mainComment = review.comments[0];
  const replies = review.comments.slice(1);

  return (
    <div className="flex justify-between gap-3 text-sm">
      <div className="flex min-w-0 flex-1 gap-3">
        <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Main comment */}
          {mainComment && (
            <ReviewCommentView comment={mainComment} isMain={true} />
          )}

          {/* Replies with indentation */}
          {replies.length > 0 && (
            <div className="ml-4 flex flex-col gap-2 border-[var(--vscode-editorWidget-border)] border-l-2 pl-3">
              {replies.map((reply) => (
                <ReviewCommentView
                  key={reply.id}
                  comment={reply}
                  isMain={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Range info on the right if available */}
      {review.range && (
        // eslint-disable-next-line i18next/no-literal-string
        <div className="shrink-0 text-muted-foreground text-xs">
          Ln {review.range.start.line}
          {review.range.start.line !== review.range.end.line &&
            `-${review.range.end.line}`}
        </div>
      )}
    </div>
  );
}
interface ReviewCommentViewProps {
  comment: ReviewComment;
  isMain: boolean;
}

function ReviewCommentView({ comment, isMain }: ReviewCommentViewProps) {
  return (
    <p
      className={
        isMain
          ? "break-words text-sm leading-tight"
          : "break-words text-muted-foreground text-xs leading-tight"
      }
    >
      {comment.body}
    </p>
  );
}

// Build label for the badge
function getBadgeLabel(reviewUri: string) {
  const filename = reviewUri.split("/").pop();
  // Remove query parameters if present
  return filename?.split("?")[0];
}

// Get file path without filename
function getFilePath(reviewUri: string) {
  const parts = reviewUri.split("/");
  parts.pop(); // Remove filename
  return parts.join("/");
}
