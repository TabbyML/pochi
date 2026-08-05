import { expect, test } from "vitest";
import { renderActiveSelection } from "../active-selection";

test("renderActiveSelection returns empty string for undefined selection", () => {
  expect(renderActiveSelection(undefined as never)).toBe("");
});

test("renderActiveSelection returns empty string for empty content", () => {
  expect(
    renderActiveSelection({
      filepath: "src/main.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      content: "   ",
    }),
  ).toBe("");
});

test("renderActiveSelection renders a file location and content", () => {
  expect(
    renderActiveSelection({
      filepath: "src/main.ts",
      range: {
        start: { line: 9, character: 0 },
        end: { line: 24, character: 0 },
      },
      content: "const x = 1;",
    }),
  ).toMatchSnapshot();
});

