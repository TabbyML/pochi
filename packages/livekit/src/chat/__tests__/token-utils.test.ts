import { beforeEach, describe, expect, it } from "vitest";
import type { BlobStore } from "../../blob-store";
import type { Message } from "../../types";
import { shouldAutoCompact } from "../auto-compact-policy";
import { parseMcpToolSet } from "../mcp-utils";
import {
  DefaultCjkCharsPerToken,
  DefaultOtherCharsPerToken,
  ImageEstimatedTokens,
  estimateTokenBreakdown,
  estimateTokens,
  estimateTotalTokens,
  getModelCalibrationFactor,
  getModelCalibrationKey,
  resetTokenCalibration,
  updateModelCalibration,
} from "../token-utils";

const modelKey = "test-model";

describe("estimateTokens", () => {
  it("estimates non-CJK text using the default chars-per-token ratio", () => {
    const text = "a".repeat(40);
    expect(estimateTokens(text)).toBe(
      Math.ceil(40 / DefaultOtherCharsPerToken),
    );
  });

  it("estimates CJK text using a smaller, denser chars-per-token ratio", () => {
    const text = "你".repeat(40);
    expect(estimateTokens(text)).toBe(Math.ceil(40 / DefaultCjkCharsPerToken));
  });

  it("buckets mixed CJK and non-CJK text separately", () => {
    const other = "a".repeat(40);
    const cjk = "你".repeat(40);
    // Each bucket's chars are divided by its own ratio and summed before
    // rounding, so the combined estimate should match that computation.
    const combined = Math.ceil(
      40 / DefaultOtherCharsPerToken + 40 / DefaultCjkCharsPerToken,
    );
    expect(estimateTokens(other + cjk)).toBe(combined);
  });

  it("estimates CJK text as more tokens per character than plain ASCII of the same length", () => {
    const asciiEstimate = estimateTokens("a".repeat(100));
    const cjkEstimate = estimateTokens("你".repeat(100));
    expect(cjkEstimate).toBeGreaterThan(asciiEstimate);
  });

  it("applies an explicit calibration factor rather than reading global state", () => {
    const text = "a".repeat(400);
    const raw = estimateTokens(text);
    expect(estimateTokens(text, 2)).toBe(Math.ceil(raw * 2));
    expect(estimateTokens(text, 0.5)).toBe(Math.ceil(raw * 0.5));
  });
});

describe("getModelCalibrationKey", () => {
  it("uses the llm's id as the key", () => {
    expect(getModelCalibrationKey({ id: "gpt-4" })).toBe("gpt-4");
  });

  it("falls back to a default key when no llm is given", () => {
    expect(getModelCalibrationKey(undefined)).toBe("default");
  });
});

describe("per-model token calibration", () => {
  beforeEach(() => {
    resetTokenCalibration();
  });

  it("defaults to a calibration factor of 1 for any model", () => {
    expect(getModelCalibrationFactor(modelKey)).toBe(1);
    expect(getModelCalibrationFactor("other-model")).toBe(1);
  });

  it("ignores non-positive inputs", () => {
    updateModelCalibration(modelKey, 0, 100);
    updateModelCalibration(modelKey, 100, 0);
    updateModelCalibration(modelKey, -5, 100);
    expect(getModelCalibrationFactor(modelKey)).toBe(1);
  });

  it("nudges the factor up when actual usage exceeds the raw estimate", () => {
    updateModelCalibration(modelKey, 200, 100);
    expect(getModelCalibrationFactor(modelKey)).toBeGreaterThan(1);
  });

  it("nudges the factor down when actual usage is below the raw estimate", () => {
    updateModelCalibration(modelKey, 50, 100);
    expect(getModelCalibrationFactor(modelKey)).toBeLessThan(1);
  });

  it("converges gradually via EMA rather than jumping straight to the new ratio", () => {
    updateModelCalibration(modelKey, 200, 100); // ratio = 2
    const factor = getModelCalibrationFactor(modelKey);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(2);
  });

  it("converges toward the true ratio across repeated samples of a raw (uncalibrated) estimate", () => {
    // Unlike the old design, callers are expected to always pass the raw
    // (factor=1) estimate, so no sqrt-convergence risk here: the ratio
    // computed each time is against a fixed baseline.
    const rawEstimate = 100;
    for (let i = 0; i < 200; i++) {
      updateModelCalibration(modelKey, rawEstimate * 2, rawEstimate);
    }
    expect(getModelCalibrationFactor(modelKey)).toBeCloseTo(2, 1);
  });

  it("clamps the factor within a bounded range to resist outliers", () => {
    for (let i = 0; i < 50; i++) {
      updateModelCalibration(modelKey, 10_000, 1);
    }
    expect(getModelCalibrationFactor(modelKey)).toBeLessThanOrEqual(3);

    resetTokenCalibration(modelKey);
    for (let i = 0; i < 50; i++) {
      updateModelCalibration(modelKey, 1, 10_000);
    }
    expect(getModelCalibrationFactor(modelKey)).toBeGreaterThanOrEqual(0.3);
  });

  it("isolates calibration state per model", () => {
    updateModelCalibration("model-a", 200, 100); // ratio = 2, factor > 1
    expect(getModelCalibrationFactor("model-a")).toBeGreaterThan(1);
    expect(getModelCalibrationFactor("model-b")).toBe(1);
  });

  it("resetTokenCalibration(modelKey) only clears that model's state", () => {
    updateModelCalibration("model-a", 200, 100);
    updateModelCalibration("model-b", 200, 100);
    resetTokenCalibration("model-a");
    expect(getModelCalibrationFactor("model-a")).toBe(1);
    expect(getModelCalibrationFactor("model-b")).toBeGreaterThan(1);
  });

  it("resetTokenCalibration() with no key clears all models", () => {
    updateModelCalibration("model-a", 200, 100);
    updateModelCalibration("model-b", 200, 100);
    resetTokenCalibration();
    expect(getModelCalibrationFactor("model-a")).toBe(1);
    expect(getModelCalibrationFactor("model-b")).toBe(1);
  });
});

describe("tool media token estimation", () => {
  it("counts MCP image tool results and readFile media outputs as ImageEstimatedTokens", () => {
    const messages: Message[] = [
      {
        id: "a-1",
        role: "assistant",
        parts: [
          {
            type: "tool-look",
            toolCallId: "call-look",
            state: "output-available",
            input: {},
            output: {
              content: [
                {
                  type: "image",
                  mimeType: "image/png",
                  data: "store-blob:abc",
                },
              ],
            },
          },
          {
            type: "tool-readFile",
            toolCallId: "call-read",
            state: "output-available",
            input: { path: "img.png" },
            output: {
              type: "media",
              mimeType: "image/png",
              data: "store-blob:def",
            },
          },
        ],
      } as unknown as Message,
    ];

    const breakdown = estimateTokenBreakdown(messages);
    expect(breakdown.toolResultsTokens).toBe(ImageEstimatedTokens);
    expect(breakdown.filesTokens).toBe(ImageEstimatedTokens);
    expect(estimateTotalTokens(messages)).toBeGreaterThanOrEqual(
      ImageEstimatedTokens * 2,
    );
  });
});

describe("MCP output token estimation matches model conversion", () => {
  const tools = parseMcpToolSet({} as BlobStore, {
    inspect: {
      description: "Inspect a resource",
      inputSchema: { jsonSchema: { type: "object", properties: {} } },
    },
  })!;

  function messagesForOutput(output: unknown): Message[] {
    return [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Inspect" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-inspect",
            toolCallId: "call-1",
            input: {},
            state: "output-available",
            output,
          },
        ],
      } as unknown as Message,
    ];
  }

  it.each([
    {
      type: "resource_link",
      uri: "file:///report.txt",
      name: "report.txt",
      mimeType: "text/plain",
    },
    {
      type: "resource",
      resource: {
        uri: "file:///report.txt",
        mimeType: "text/plain",
        text: "Report",
      },
    },
    { type: "image", data: "store-blob:missing-mime-type" },
  ])("counts the entire JSON fallback for $type content", async (item) => {
    const output = {
      content: [{ type: "text", text: "Report available" }, item],
      structuredContent: { report: "x".repeat(400_000) },
    };
    const converted = await tools.inspect.toModelOutput!({
      toolCallId: "call-1",
      input: {},
      output,
    });
    expect(converted).toEqual({ type: "json", value: output });
    const messages = messagesForOutput(output);

    for (const calibrationFactor of [1, 1.5]) {
      const expected = estimateTokens(
        JSON.stringify(output),
        calibrationFactor,
      );
      expect(
        estimateTokenBreakdown(messages, calibrationFactor).toolResultsTokens,
      ).toBe(expected);
      expect(
        estimateTotalTokens(messages, calibrationFactor),
      ).toBeGreaterThanOrEqual(expected);
    }
    expect(
      shouldAutoCompact({
        messages,
        llm: {
          id: "test",
          type: "openai",
          modelId: "test",
          contextWindow: 128_000,
          maxOutputTokens: 4096,
        },
        task: null,
        estimatedTotalTokens: estimateTotalTokens(messages),
      }),
    ).toBe(true);
  });

  it("only counts supported text content that is actually sent to the model", async () => {
    const output = {
      content: [{ type: "text", text: "A short report" }],
      structuredContent: { report: "x".repeat(400_000) },
    };
    expect(
      await tools.inspect.toModelOutput!({
        toolCallId: "call-1",
        input: {},
        output,
      }),
    ).toEqual({
      type: "content",
      value: output.content,
    });
    expect(
      estimateTokenBreakdown(messagesForOutput(output)).toolResultsTokens,
    ).toBe(estimateTokens("A short report"));
  });

  it("counts the error text selected by the MCP converter", async () => {
    const output = {
      error: "Request failed",
      content: [{ type: "unsupported" }],
    };
    expect(
      await tools.inspect.toModelOutput!({
        toolCallId: "call-1",
        input: {},
        output,
      }),
    ).toEqual({
      type: "error-text",
      value: output.error,
    });
    expect(
      estimateTokenBreakdown(messagesForOutput(output)).toolResultsTokens,
    ).toBe(estimateTokens(output.error));
  });
});
