import { describe, expect, it } from "vitest";
import { convertDataPartToText } from "../flexible-chat-transport";
import type { Message } from "../../types";

type MessagePart = Message["parts"][number];

describe("convertDataPartToText", () => {
  it("passes through parts that are not data parts", () => {
    const part = { type: "text", text: "hello" } as MessagePart;
    expect(convertDataPartToText(part)).toBe(part);
  });

  it("converts data-reviews into a text part", () => {
    const part = {
      type: "data-reviews",
      data: { reviews: [] },
    } as unknown as MessagePart;

    const result = convertDataPartToText(part);
    expect(result).toEqual({ type: "text", text: "" });
  });

  it("returns no text parts when data-active-selection has neither field set", () => {
    const part = {
      type: "data-active-selection",
      data: {},
    } as unknown as MessagePart;

    expect(convertDataPartToText(part)).toEqual([]);
  });

  it("renders only the active file selection when only that field is set", () => {
    const part = {
      type: "data-active-selection",
      data: {
        activeSelection: {
          filepath: "src/main.ts",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 1, character: 0 },
          },
          content: "const x = 1;",
        },
      },
    } as unknown as MessagePart;

    const result = convertDataPartToText(part) as { type: string; text: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect(result[0].text).toContain("active-selection");
    expect(result[0].text).toContain("const x = 1;");
  });

  it("renders only the terminal selection when only that field is set", () => {
    const part = {
      type: "data-active-selection",
      data: {
        activeTerminalTextSelection: {
          terminalName: "bash",
          backgroundJobId: "term-1",
          content: "echo hello",
        },
      },
    } as unknown as MessagePart;

    const result = convertDataPartToText(part) as { type: string; text: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect(result[0].text).toContain("terminal-selection");
    expect(result[0].text).toContain("echo hello");
  });

  it("renders both file and terminal selections when both fields are set", () => {
    const part = {
      type: "data-active-selection",
      data: {
        activeSelection: {
          filepath: "src/main.ts",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 1, character: 0 },
          },
          content: "const x = 1;",
        },
        activeTerminalTextSelection: {
          terminalName: "bash",
          backgroundJobId: "term-1",
          content: "echo hello",
        },
      },
    } as unknown as MessagePart;

    const result = convertDataPartToText(part) as { type: string; text: string }[];
    expect(result).toHaveLength(2);
    expect(result[0].text).toContain("active-selection");
    expect(result[1].text).toContain("terminal-selection");
  });
});
