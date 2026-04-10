import { describe, expect, it } from "vitest";
import { shouldUseToolCallMiddleware } from "../should-use-tool-call-middleware";
import type { RequestData } from "../../types";

function createOpenAILlm(
  overrides: Partial<Extract<RequestData["llm"], { type: "openai" }>> = {},
): Extract<RequestData["llm"], { type: "openai" }> {
  return {
    id: "test/openai-model",
    type: "openai",
    modelId: "test-model",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    ...overrides,
  };
}

describe("shouldUseToolCallMiddleware", () => {
  it("enables the middleware for custom OpenAI-compatible base URLs by default", () => {
    expect(
      shouldUseToolCallMiddleware(
        createOpenAILlm({ baseURL: "https://lemonade.example.com/v1" }),
      ),
    ).toBe(true);
  });

  it("does not force the middleware for the official OpenAI API", () => {
    expect(
      shouldUseToolCallMiddleware(
        createOpenAILlm({ baseURL: "https://api.openai.com/v1" }),
      ),
    ).toBe(false);
  });

  it("respects an explicit opt-out for custom OpenAI-compatible base URLs", () => {
    expect(
      shouldUseToolCallMiddleware(
        createOpenAILlm({
          baseURL: "https://lemonade.example.com/v1",
          useToolCallMiddleware: false,
        }),
      ),
    ).toBe(false);
  });

  it("respects an explicit opt-in", () => {
    expect(
      shouldUseToolCallMiddleware(
        createOpenAILlm({ useToolCallMiddleware: true }),
      ),
    ).toBe(true);
  });
});
