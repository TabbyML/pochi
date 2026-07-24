import { expect, test } from "vitest";
import {
  renderActiveSelection,
  renderTerminalTextSelection,
} from "../active-selection";

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

test("renderTerminalTextSelection returns empty string for undefined selection", () => {
  expect(renderTerminalTextSelection(undefined)).toBe("");
});

test("renderTerminalTextSelection returns empty string for empty content", () => {
  expect(
    renderTerminalTextSelection({
      terminalName: "bash",
      content: "   ",
    }),
  ).toBe("");
});

test("renderTerminalTextSelection renders the terminal name and content", () => {
  expect(
    renderTerminalTextSelection({
      terminalName: "bash",
      backgroundJobId: "term-1",
      content: "npm run build\nBuild succeeded.",
    }),
  ).toMatchSnapshot();
});
