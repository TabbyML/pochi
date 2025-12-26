import type { Review } from "../../vscode-webui-bridge/types/review";

export function renderReviewComments(reviews: Review[]): string {
  if (reviews.length === 0) {
    return "";
  }

  const reviewTexts = reviews.map((review) => {
    const location = review.range
      ? ` (${review.range.start.line}:${review.range.start.character}-${review.range.end.line}:${review.range.end.character})`
      : "";

    const commentsText = review.comments
      .map((comment, index) => {
        const prefix = review.comments.length > 1 ? `${index + 1}. ` : "";
        return `${prefix}${comment.body}`;
      })
      .join("\n");

    return `${review.uri}${location}:\n${commentsText}`;
  });

  const header = `The user has received code review comments from their team or review system that need to be addressed. These comments highlight issues, suggestions, or questions about specific parts of the code. Your task is to help resolve these comments by making the necessary code changes, explanations, or improvements.

IMPORTANT: If you need more context to understand a review comment, read the file being reviewed using the readFile tool. Understanding the surrounding code will help you provide better solutions.

Review comments (format: filepath(line:char-line:char):):\n`;

  return `${header}\n${reviewTexts.join("\n\n")}`;
}
