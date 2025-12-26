import type { Review } from "../../vscode-webui-bridge/types/review";

export function renderReviewComments(reviews: Review[]): string {
  if (reviews.length === 0) {
    return "";
  }

  const reviewTexts = reviews.map((review) => {
    let codeSnippetText = "";
    const { content, startLine, endLine } = review.codeSnippet;
    codeSnippetText = `${review.uri}:${startLine}-${endLine}:\n\`\`\`\n${content}\n\`\`\`\n`;

    const location = review.range
      ? `${review.range.start.line}:${review.range.start.character}-${review.range.end.line}:${review.range.end.character}`
      : "";

    const commentsText = review.comments
      .map((comment, index) => {
        const prefix = review.comments.length > 1 ? `${index + 1}. ` : "";
        return `${prefix}${comment.body}`;
      })
      .join("\n");

    return `<review>\n${codeSnippetText}<comment location="${location}">\n${commentsText}\n</comment>\n</review>`;
  });

  const header = `The user has received code review comments from their team or review system that need to be addressed. These comments highlight issues, suggestions, or questions about specific parts of the code. Your task is to help resolve these comments by making the necessary code changes, explanations, or improvements.

The code snippets provided below include surrounding context to help you understand the broader context of each comment.

IMPORTANT: If you need additional context beyond the provided code snippets, use the readFile tool.`;

  return `${header}\n${reviewTexts.join("\n\n")}`;
}
