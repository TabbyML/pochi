import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

interface Props {
  reviews: Review[];
}

export const Reviews: React.FC<Props> = ({ reviews }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

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
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="mt-2 rounded-md border"
    >
      <CollapsibleTrigger asChild>
        <div className="flex cursor-pointer items-center gap-1 border-border px-3 py-1.5 hover:bg-border/30">
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90",
            )}
          />
          <ListCheck className="size-4 shrink-0" />
          <div className="font-semibold text-sm">{t("reviewUI.reviews")}</div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1">
          {groupedReviews.map((group) => (
            <ReviewFileGroup
              key={group.uri}
              uri={group.uri}
              reviews={group.reviews}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
    vscodeHost.openReview(reviews[0], { focusCommentsPanel: false });
  };

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
            <FileIcon path={uri} />
            {getBadgeLabel(uri)}
          </span>
        </div>
      </div>
      <CollapsibleContent>
        <div
          className={cn("ml-6 flex flex-col gap-2 px-3 py-1", {
            "mb-1": isOpen,
          })}
        >
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ReviewItemProps {
  review: Review;
}

function ReviewItem({ review }: ReviewItemProps) {
  const mainComment = review.comments[0];
  const replies = review.comments.slice(1);

  return (
    <div className="flex justify-between gap-2 text-sm">
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
  const filename = reviewUri
    .replace(/^pochi-diff-changes:/, "")
    .split("/")
    .pop();
  // Remove query parameters if present
  return filename?.split("?")[0];
}
