import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { describe, expect, it } from "vitest";
import { displayModelToLLM } from "../display-model-to-llm";

describe("displayModelToLLM", () => {
  it("converts a vendor model", () => {
    const model: DisplayModel = {
      type: "vendor",
      id: "vendor/model",
      vendorId: "vendor",
      modelId: "model",
      contentType: ["text/plain"],
      options: {
        contextWindow: 123,
        useToolCallMiddleware: true,
        useReasoningMiddleware: true,
      },
      getCredentials: () => Promise.resolve({}),
    };
    const llm = displayModelToLLM(model);
    expect(llm).toMatchObject({
      id: "vendor/model",
      type: "vendor",
      contextWindow: 123,
      useToolCallMiddleware: true,
      useReasoningMiddleware: true,
      contentType: ["text/plain"],
    });
  });

  it("converts a google-vertex-tuning model", () => {
    const vertex = { type: "model-url" as const, issueUrl: "", modelUrl: "", timeout: 0 };
    const model: DisplayModel = {
      type: "provider",
      id: "vertex/model",
      modelId: "model",
      contentType: ["application/json"],
      options: {
        maxTokens: 100,
        contextWindow: 123,
        useToolCallMiddleware: true,
        useReasoningMiddleware: true,
      },
      provider: {
        kind: "google-vertex-tuning",
        vertex,
      },
    };
    const llm = displayModelToLLM(model);
    expect(llm).toMatchObject({
      id: "vertex/model",
      type: "google-vertex-tuning",
      modelId: "model",
      vertex,
      maxOutputTokens: 100,
      contextWindow: 123,
      useToolCallMiddleware: true,
      useReasoningMiddleware: true,
      contentType: ["application/json"],
    });
  });

  it("converts an ai-gateway model", () => {
    const model: DisplayModel = {
      type: "provider",
      id: "gateway/model",
      modelId: "model",
      contentType: ["application/json"],
      options: {
        maxTokens: 100,
        contextWindow: 123,
        useToolCallMiddleware: true,
        useReasoningMiddleware: true,
      },
      provider: {
        kind: "ai-gateway",
        apiKey: "key",
      },
    };
    const llm = displayModelToLLM(model);
    expect(llm).toMatchObject({
      id: "gateway/model",
      type: "ai-gateway",
      modelId: "model",
      apiKey: "key",
      maxOutputTokens: 100,
      contextWindow: 123,
      useToolCallMiddleware: true,
      useReasoningMiddleware: true,
      contentType: ["application/json"],
    });
  });

  it("converts an openai-style model", () => {
    const model: DisplayModel = {
      type: "provider",
      id: "openai/model",
      modelId: "model",
      contentType: ["application/json"],
      options: {
        maxTokens: 100,
        contextWindow: 123,
        useToolCallMiddleware: true,
        useReasoningMiddleware: true,
      },
      provider: {
        kind: "openai",
        baseURL: "base",
        apiKey: "key",
      },
    };
    const llm = displayModelToLLM(model);
    expect(llm).toMatchObject({
      id: "openai/model",
      type: "openai",
      modelId: "model",
      baseURL: "base",
      apiKey: "key",
      maxOutputTokens: 100,
      contextWindow: 123,
      useToolCallMiddleware: true,
      useReasoningMiddleware: true,
      contentType: ["application/json"],
    });
  });
});
