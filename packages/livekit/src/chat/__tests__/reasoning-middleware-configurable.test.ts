import { describe, expect, it } from "vitest";
import { createReasoningMiddleware } from "../middlewares/reasoning-middleware";
import type { RequestData } from "../../types";

describe("createReasoningMiddleware", () => {
  it("extracts reasoning content between <think> tags", async () => {
    const middleware = createReasoningMiddleware("think");
    const stream = new ReadableStream<any>({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "t1" });
        controller.enqueue({ type: "text-delta", delta: "hi <think>let's" });
        controller.enqueue({ type: "text-delta", delta: " think</think> okay" });
        controller.enqueue({ type: "text-end" });
        controller.close();
      },
    });
    const { stream: transformed } = await middleware.wrapStream!({
      doStream: async () => ({ stream, attributes: {} }),
      doGenerate: async () => {
        throw new Error("not implemented");
      },
      params: {} as any,
      model: {} as any,
    });

    const chunks: any[] = [];
    for await (const chunk of transformed) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: "text-start", id: "t1" },
      { type: "text-delta", delta: "hi ", id: "t1" },
      { type: "reasoning-start", id: "reasoning-1" },
      { type: "reasoning-delta", delta: "let's", id: "reasoning-1" },
      { type: "reasoning-delta", delta: " think", id: "reasoning-1" },
      { type: "reasoning-end", id: "reasoning-1" },
      { type: "text-delta", delta: " okay", id: "t1" },
      { type: "text-end" },
    ]);
  });
});

describe("reasoning middleware configuration", () => {
  function isWellKnownReasoningModel(model?: string): boolean {
    if (!model) return false;
    const models = [/glm-4.*/, /qwen3.*thinking/];
    const x = model.toLowerCase();
    for (const m of models) {
      if (x.match(m)?.length) return true;
    }
    return false;
  }

  function getUseReasoning(llm: RequestData["llm"]) {
    let useReasoning = "useReasoningMiddleware" in llm ? (llm as any).useReasoningMiddleware : undefined;
    if (useReasoning === undefined && "modelId" in llm) {
      useReasoning = isWellKnownReasoningModel(llm.modelId);
    }
    return !!useReasoning;
  }

  it("uses reasoning middleware for well-known reasoning models", () => {
    expect(
      getUseReasoning({
        id: "1",
        type: "openai",
        modelId: "glm-4-flash",
        contextWindow: 1,
        maxOutputTokens: 1,
      }),
    ).toBe(true);
    expect(
      getUseReasoning({
        id: "2",
        type: "openai",
        modelId: "gpt-4",
        contextWindow: 1,
        maxOutputTokens: 1,
      }),
    ).toBe(false);
  });

  it("explicitly enables reasoning middleware when useReasoningMiddleware is true", () => {
    expect(
      getUseReasoning({
        id: "3",
        type: "openai",
        modelId: "gpt-4",
        contextWindow: 1,
        maxOutputTokens: 1,
        useReasoningMiddleware: true,
      }),
    ).toBe(true);
    expect(
      getUseReasoning({
        id: "4",
        type: "anthropic",
        modelId: "claude-3-5-sonnet-20240620",
        contextWindow: 1,
        maxOutputTokens: 1,
        useReasoningMiddleware: true,
      }),
    ).toBe(true);
  });

  it("explicitly disables reasoning middleware when useReasoningMiddleware is false, even for reasoning models", () => {
    expect(
      getUseReasoning({
        id: "5",
        type: "openai",
        modelId: "glm-4-flash",
        contextWindow: 1,
        maxOutputTokens: 1,
        useReasoningMiddleware: false,
      }),
    ).toBe(false);
    expect(
      getUseReasoning({
        id: "6",
        type: "openai",
        modelId: "qwen3-7b-thinking",
        contextWindow: 1,
        maxOutputTokens: 1,
        useReasoningMiddleware: false,
      }),
    ).toBe(false);
  });
});
