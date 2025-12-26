import { expect, test } from "vitest";
import { renderReviewComments } from "../review-comments";
import type { Review } from "../../../vscode-webui-bridge/types/review";

test("empty reviews array", () => {
  const reviews: Review[] = [];
  expect(renderReviewComments(reviews)).toBe("");
});

test("single review with single comment and range", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/app.ts",
      range: {
        start: { line: 10, character: 5 },
        end: { line: 12, character: 20 },
      },
      comments: [
        {
          id: "comment-1",
          body: "This function should handle edge cases for null values.",
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("single review with multiple comments", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/utils/validation.ts",
      range: {
        start: { line: 25, character: 0 },
        end: { line: 30, character: 1 },
      },
      comments: [
        {
          id: "comment-1",
          body: "Consider adding input validation here.",
        },
        {
          id: "comment-2",
          body: "This could throw an error if the input is undefined.",
        },
        {
          id: "comment-3",
          body: "Maybe use a try-catch block?",
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("single review without range", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "README.md",
      comments: [
        {
          id: "comment-1",
          body: "Please update the documentation to include setup instructions.",
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("multiple reviews with different files", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/components/button.tsx",
      range: {
        start: { line: 15, character: 2 },
        end: { line: 15, character: 45 },
      },
      comments: [
        {
          id: "comment-1",
          body: "Should this use the theme color instead of hardcoded values?",
        },
      ],
    },
    {
      id: "review-2",
      uri: "src/api/users.ts",
      range: {
        start: { line: 42, character: 0 },
        end: { line: 50, character: 1 },
      },
      comments: [
        {
          id: "comment-2",
          body: "Missing error handling for failed API requests.",
        },
        {
          id: "comment-3",
          body: "Consider adding retry logic.",
        },
      ],
    },
    {
      id: "review-3",
      uri: "tests/integration/auth.test.ts",
      comments: [
        {
          id: "comment-4",
          body: "Add tests for invalid token scenarios.",
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("review with special characters in comment", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/parser.ts",
      range: {
        start: { line: 100, character: 10 },
        end: { line: 105, character: 5 },
      },
      comments: [
        {
          id: "comment-1",
          body: 'The regex pattern `/^[a-z]+$/i` should be `\\w+` for better matching.',
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("review with multiline comment", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/database/connection.ts",
      range: {
        start: { line: 5, character: 0 },
        end: { line: 8, character: 2 },
      },
      comments: [
        {
          id: "comment-1",
          body: `This connection logic has several issues:
1. No connection pooling
2. Missing timeout configuration
3. Should handle connection errors gracefully`,
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("review at start of file", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/index.ts",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 30 },
      },
      comments: [
        {
          id: "comment-1",
          body: "Missing copyright header.",
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});

test("review with large line numbers", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/legacy-code.js",
      range: {
        start: { line: 1523, character: 15 },
        end: { line: 1650, character: 3 },
      },
      comments: [
        {
          id: "comment-1",
          body: "This entire section should be refactored into smaller functions.",
        },
      ],
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});
