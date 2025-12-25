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
      codeSnippet: {
        content: `  return data.map(item => item.value);\n}\n\nfunction processData(data) {\n  if (!data) {\n    return [];\n  }\n  return transform(data);\n}\n\nfunction transform(data) {`,
        startLine: 5,
        endLine: 17,
      },
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
      codeSnippet: {
        content: `export function validateEmail(email: string): boolean {\n  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);\n}\n\nexport function sanitizeInput(input: string): string {\n  const trimmed = input.trim();\n  const sanitized = trimmed.replace(/<script>/gi, '');\n  return sanitized;\n}\n\nexport function parseJSON(json: string) {`,
        startLine: 20,
        endLine: 35,
      },
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
      codeSnippet: {
        content: `  const [isHovered, setIsHovered] = useState(false);\n\n  return (\n    <button\n      className={className}\n      style={{ backgroundColor: '#3b82f6' }}\n      onMouseEnter={() => setIsHovered(true)}\n      onMouseLeave={() => setIsHovered(false)}\n      onClick={onClick}\n    >\n      {children}`,
        startLine: 10,
        endLine: 20,
      },
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
      codeSnippet: {
        content: `  return users.filter(u => u.active);\n}\n\nexport async function fetchUserById(id: string) {\n  const response = await fetch(\`/api/users/\${id}\`);\n  const data = await response.json();\n  return data;\n}\n\nexport async function updateUser(id: string, updates: UserUpdate) {\n  const response = await fetch(\`/api/users/\${id}\`, {`,
        startLine: 37,
        endLine: 55,
      },
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

test("review with code snippet containing special formatting", () => {
  const reviews: Review[] = [
    {
      id: "review-1",
      uri: "src/formatter.ts",
      range: {
        start: { line: 20, character: 0 },
        end: { line: 25, character: 1 },
      },
      comments: [
        {
          id: "comment-1",
          body: "The string template formatting could be improved.",
        },
      ],
      codeSnippet: {
        content: `function formatMessage(user: string, count: number): string {\n  // TODO: Add i18n support\n  const template = \`User \${user} has \${count} item(s)\`;\n  return template;\n}\n\nexport function logMessage(msg: string) {\n  console.log(\`[\${new Date().toISOString()}] \${msg}\`);\n}\n\n// Helper function`,
        startLine: 15,
        endLine: 30,
      },
    },
  ];
  expect(renderReviewComments(reviews)).toMatchSnapshot();
});