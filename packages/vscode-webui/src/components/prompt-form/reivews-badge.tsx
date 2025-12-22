import type { Review } from "@getpochi/common/vscode-webui-bridge";
import { useMemo } from "react";
import { ReviewBadge } from "../message/review-badge";

interface Props {
  reviews: Review[];
}

export const ReviewBadges: React.FC<Props> = ({ reviews }) => {
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
        return (
          <ReviewBadge key={x.uri} uri={x.uri} reviewCount={x.reviews.length} />
        );
      })}
    </>
  );
};
