import { expect, test } from "vitest";
import { renderTerminalContext } from "../terminal-context";

test("renderTerminalContext returns empty string for undefined selections", () => {
  expect(renderTerminalContext(undefined)).toBe("");
});

test("renderTerminalContext returns empty string for an empty array", () => {
  expect(renderTerminalContext([])).toBe("");
});

test("renderTerminalContext returns empty string when all selections are empty", () => {
  expect(
    renderTerminalContext([{ terminalName: "bash", content: "   " }]),
  ).toBe("");
});

test("renderTerminalContext renders a single selection", () => {
  expect(
    renderTerminalContext([
      {
        terminalName: "bash",
        backgroundJobId: "term-1",
        content: "npm run build\nBuild succeeded.",
      },
    ]),
  ).toMatchSnapshot();
});

test("renderTerminalContext renders multiple selections and skips empty ones", () => {
  expect(
    renderTerminalContext([
      {
        terminalName: "bash",
        backgroundJobId: "term-1",
        content: "npm run build\nBuild succeeded.",
      },
      {
        terminalName: "zsh",
        content: "   ",
      },
      {
        terminalName: "zsh",
        backgroundJobId: "term-2",
        content: "git status",
      },
    ]),
  ).toMatchSnapshot();
});
