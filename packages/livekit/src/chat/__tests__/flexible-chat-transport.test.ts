import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import {
  convertDataPartToText,
  extractContentFilterMetadata,
  getNumCompacts,
} from "../flexible-chat-transport";

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

  it("returns no parts when data-terminal-context has no selections", () => {
    const part = {
      type: "data-terminal-context",
      data: { textSelections: [] },
    } as unknown as MessagePart;

    expect(convertDataPartToText(part)).toEqual([]);
  });

  it("converts data-terminal-context into a single text part with all selections", () => {
    const part = {
      type: "data-terminal-context",
      data: {
        textSelections: [
          { terminalName: "bash", backgroundJobId: "term-1", content: "echo hello" },
          { terminalName: "zsh", content: "git status" },
        ],
      },
    } as unknown as MessagePart;

    const result = convertDataPartToText(part) as { type: string; text: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("text");
    expect(result[0].text).toContain("terminal-context-selection terminal=\"bash\"");
    expect(result[0].text).toContain("echo hello");
    expect(result[0].text).toContain("terminal-context-selection terminal=\"zsh\"");
    expect(result[0].text).toContain("git status");
  });

  it("converts one background job notification into one XML text part", () => {
    const part = {
      type: "data-background-job-notification",
      data: {
        notificationId: "bgjob-cmd-1:terminal",
        backgroundJobId: "bgjob-cmd-1",
        outputFile: "/tmp/job<&>.log",
        status: "failed",
        summary: 'Background command "test <all>" failed with exit code 7',
        exitCode: 7,
        finishedAt: 1,
      },
    } as unknown as MessagePart;

    const result = convertDataPartToText(part) as {
      type: string;
      text: string;
    };
    expect(result.type).toBe("text");
    expect(result.text).not.toContain("<system-reminder>");
    expect(result.text).toContain("<background-job-notification>");
    expect(result.text).toContain("/tmp/job&lt;&amp;&gt;.log");
    expect(result.text).toContain(
      "Background command &quot;test &lt;all&gt;&quot; failed with exit code 7",
    );
  });
});

describe("extractContentFilterMetadata", () => {
  it("keeps Anthropic stop details without the rest of provider metadata", () => {
    expect(
      extractContentFilterMetadata(
        {
          anthropic: {
            stopDetails: {
              type: "refusal",
              category: "bio",
              explanation: "Request blocked by the safety classifier.",
            },
            usage: { input_tokens: 100 },
          },
        },
        "content-filter",
        "refusal",
      ),
    ).toEqual({
      provider: "anthropic",
      reason: "refusal",
      details: {
        type: "refusal",
        category: "bio",
        explanation: "Request blocked by the safety classifier.",
      },
    });
  });

  it("records the Anthropic provider when stop details are unavailable", () => {
    expect(
      extractContentFilterMetadata(
        {
          anthropic: {
            usage: { input_tokens: 100 },
          },
        },
        "content-filter",
        "refusal",
      ),
    ).toEqual({ provider: "anthropic", reason: "refusal" });
  });

  it("keeps only Google safety details", () => {
    expect(
      extractContentFilterMetadata(
        {
          google: {
            promptFeedback: { blockReason: "SAFETY" },
            safetyRatings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT" }],
            finishMessage: "Blocked for safety reasons.",
            groundingMetadata: { searchEntryPoint: "unrelated" },
          },
        },
        "content-filter",
        "SAFETY",
      ),
    ).toEqual({
      provider: "google",
      reason: "SAFETY",
      details: {
        promptFeedback: { blockReason: "SAFETY" },
        safetyRatings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT" }],
        finishMessage: "Blocked for safety reasons.",
      },
    });
  });

  it("reads Google safety details from Vertex metadata", () => {
    expect(
      extractContentFilterMetadata(
        {
          vertex: {
            promptFeedback: { blockReason: "BLOCKLIST" },
            safetyRatings: [],
            finishMessage: "Blocked by Vertex safety settings.",
          },
        },
        "content-filter",
        "BLOCKLIST",
      ),
    ).toEqual({
      provider: "google",
      reason: "BLOCKLIST",
      details: {
        promptFeedback: { blockReason: "BLOCKLIST" },
        safetyRatings: [],
        finishMessage: "Blocked by Vertex safety settings.",
      },
    });
  });

  it("recognizes a prompt-level Google block reported with finish reason other", () => {
    expect(
      extractContentFilterMetadata(
        {
          google: {
            promptFeedback: { blockReason: "SAFETY" },
            safetyRatings: [],
            finishMessage: null,
          },
        },
        "other",
      ),
    ).toEqual({
      provider: "google",
      details: {
        promptFeedback: { blockReason: "SAFETY" },
        safetyRatings: [],
        finishMessage: null,
      },
    });
  });

  it("ignores normal Google metadata reported with finish reason other", () => {
    expect(
      extractContentFilterMetadata(
        {
          google: {
            promptFeedback: { safetyRatings: [] },
            safetyRatings: [],
            finishMessage: null,
          },
        },
        "other",
      ),
    ).toBeUndefined();
  });
});

describe("getNumCompacts", () => {
  it("counts persisted compact blocks before LLM message trimming", () => {
    const messages = [
      {
        id: "checkpoint-1",
        role: "user",
        parts: [
          { type: "text", text: "<compact>first summary</compact>" },
          { type: "text", text: "continue" },
        ],
      },
      {
        id: "checkpoint-2",
        role: "user",
        parts: [{ type: "text", text: "<compact>second summary</compact>" }],
      },
      {
        id: "new-message",
        role: "user",
        parts: [{ type: "text", text: "continue" }],
      },
    ] as Message[];

    expect(getNumCompacts(messages)).toBe(2);
  });
});
