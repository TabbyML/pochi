import type { Review } from "../../vscode-webui-bridge/types/review";

export function renderReviewComments(reviews: Review[]): string {
  const reviewTexts = reviews.map((review) => {
    const rangeText = review.range
      ? ` (${review.range.start.line}:${review.range.start.character} to ${review.range.end.line}:${review.range.end.character})`
      : "";
    const commentsText = review.comments
      .map((comment) => `    + ${comment.body}`)
      .join("\n");
    return `  - File: ${review.uri}${rangeText}\n${commentsText}`;
  });
  return `I have the following code review comments, please address them:\n\n${reviewTexts.join("\n\n")}`;
}
