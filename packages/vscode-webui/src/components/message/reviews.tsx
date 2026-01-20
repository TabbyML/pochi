import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { FileIcon } from "@/features/tools";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import type {
  Review,
  ReviewComment,
} from "@getpochi/common/vscode-webui-bridge";
import { ChevronRight, ListCheck, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertReviewThreadUri, getReviewBadgeLabel } from "./review-badge";

interface Props {
  reviews: Review[];
}

export const Reviews: React.FC<Props> = ({ reviews }) => {
  const { t } = useTranslation();

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
    <CollapsibleSection
      title={
        <>
          <ListCheck className="size-4 shrink-0" />
          {t("reviewUI.reviews")}
        </>
      }
    >
      {groupedReviews.map((group) => (
        <ReviewFileGroup
          key={group.uri}
          uri={group.uri}
          reviews={group.reviews}
        />
      ))}
    </CollapsibleSection>
  );
};

interface ReviewFileGroupProps {
  uri: string;
  reviews: Review[];
}

function ReviewFileGroup({ uri, reviews }: ReviewFileGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  const onFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reviews.length) return;
    vscodeHost.openReview(reviews[0]);
  };

  const onReviewClick = (review: Review) => {
    vscodeHost.openReview(review, { revealRange: true });
  };

  const displayUri = convertReviewThreadUri(uri);

  if (!reviews.length) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className="flex cursor-pointer items-center justify-between rounded py-1 transition-colors hover:bg-border/30"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex min-w-0 items-center gap-1.5 px-3">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
          <span
            className="truncate font-medium text-sm hover:underline"
            onClick={onFileClick}
          >
            <FileIcon path={displayUri} />
            {getReviewBadgeLabel(displayUri)}
          </span>
        </div>
      </div>
      <CollapsibleContent>
        <div
          className={cn("flex flex-col gap-2", {
            "mb-1": isOpen,
          })}
        >
          {reviews.map((review) => (
            <ReviewItem
              onClick={() => onReviewClick(review)}
              key={review.id}
              review={review}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ReviewItemProps {
  review: Review;
  onClick: () => void;
}

function ReviewItem({ review, onClick }: ReviewItemProps) {
  const mainComment = review.comments[0];
  const replies = review.comments.slice(1);

  return (
    <div
      className="flex cursor-pointer justify-between gap-2 py-1 pr-3 pl-9 text-sm hover:bg-border/30"
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 gap-1.5">
        <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Main comment */}
          {mainComment && (
            <ReviewCommentView comment={mainComment} isMain={true} />
          )}

          {/* Replies with indentation */}
          {replies.length > 0 && (
            <div className="ml-2 flex flex-col gap-1 border-[var(--vscode-editorWidget-border)] border-l-2 pl-2">
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
          Ln {review.range.start.line + 1}
          {review.range.start.line !== review.range.end.line &&
            `-${review.range.end.line + 1}`}
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
