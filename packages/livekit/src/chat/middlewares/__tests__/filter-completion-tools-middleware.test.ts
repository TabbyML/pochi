import { describe, it, expect, vi } from "vitest";
import { createFilterCompletionToolsMiddleware } from "../filter-completion-tools-middleware";
import type {
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

describe("filterCompletionToolsMiddleware", () => {
  const middleware = createFilterCompletionToolsMiddleware();

  async function processStream(parts: LanguageModelV2StreamPart[]) {
    const readableStream = new ReadableStream<LanguageModelV2StreamPart>({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(part);
        }
        controller.close();
      },
    });

    const doStream = vi.fn().mockResolvedValue({
      stream: readableStream,
      rawCall: {},
      rawResponse: {},
    });

    const result = await (middleware as any).wrapStream({
      doStream,
      params: {},
    });

    const reader = result.stream.getReader();
    const output: LanguageModelV2StreamPart[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.push(value);
    }
    return output;
  }

  it("should allow todoWrite and then attemptCompletion", async () => {
    const input: LanguageModelV2StreamPart[] = [
      { type: "tool-input-start", toolName: "todoWrite", id: "1" },
      { type: "tool-input-delta", id: "1", delta: "{}" },
      { type: "tool-call", toolCallId: "1", toolName: "todoWrite", input: "{}" },
      { type: "tool-input-start", toolName: "attemptCompletion", id: "2" },
      { type: "tool-input-delta", id: "2", delta: "{}" },
      { type: "tool-call", toolCallId: "2", toolName: "attemptCompletion", input: "{}" },
    ];

    const output = await processStream(input);
    expect(output).toEqual(input);
  });

  it("should filter out attemptCompletion if other tools are already present", async () => {
    const input: LanguageModelV2StreamPart[] = [
      { type: "tool-input-start", toolName: "executeCommand", id: "1" },
      { type: "tool-input-delta", id: "1", delta: "{}" },
      { type: "tool-call", toolCallId: "1", toolName: "executeCommand", input: "{}" },
      { type: "tool-input-start", toolName: "attemptCompletion", id: "2" },
      { type: "tool-input-delta", id: "2", delta: "{}" },
      { type: "tool-call", toolCallId: "2", toolName: "attemptCompletion", input: "{}" },
    ];

    const output = await processStream(input);
    expect(output).toHaveLength(3);
    expect(output[0]).toEqual(input[0]);
    expect(output[1]).toEqual(input[1]);
    expect(output[2]).toEqual(input[2]);
    expect(output.find(p => (p as any).id === "2" || (p as any).toolCallId === "2")).toBeUndefined();
  });

  it("should filter out subsequent tools if attemptCompletion is already present", async () => {
    const input: LanguageModelV2StreamPart[] = [
      { type: "tool-input-start", toolName: "attemptCompletion", id: "1" },
      { type: "tool-input-delta", id: "1", delta: "{}" },
      { type: "tool-call", toolCallId: "1", toolName: "attemptCompletion", input: "{}" },
      { type: "tool-input-start", toolName: "executeCommand", id: "2" },
      { type: "tool-input-delta", id: "2", delta: "{}" },
      { type: "tool-call", toolCallId: "2", toolName: "executeCommand", input: "{}" },
    ];

    const output = await processStream(input);
    expect(output).toHaveLength(3);
    expect(output[0]).toEqual(input[0]);
    expect(output[1]).toEqual(input[1]);
    expect(output[2]).toEqual(input[2]);
    expect(output.find(p => (p as any).id === "2" || (p as any).toolCallId === "2")).toBeUndefined();
  });
});
