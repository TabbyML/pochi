// Register the models.
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-tabby/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-codex/edge";
import "@getpochi/vendor-github-copilot/edge";
import "@getpochi/vendor-qwen-code/edge";

import { constants } from "@getpochi/common";
import { createModel } from "@getpochi/common/vendor/edge";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData } from "@getpochi/livekit";

export function displayModelToLLM(model: DisplayModel): LLMRequestData {
  if (model.type === "vendor") {
    return {
      id: model.id,
      type: "vendor",
      contextWindow: model.options.contextWindow,
      effectiveContextWindow: model.options.effectiveContextWindow,
      useToolCallMiddleware: model.options.useToolCallMiddleware,
      getModel: () =>
        createModel(model.vendorId, {
          modelId: model.modelId,
          getCredentials: model.getCredentials,
        }),
      contentType: model.contentType,
    };
  }

  const { provider } = model;
  if (provider.kind === "google-vertex-tuning") {
    return {
      id: model.id,
      type: "google-vertex-tuning",
      modelId: model.modelId,
      vertex: provider.vertex,
      maxOutputTokens:
        model.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        model.options.contextWindow ?? constants.DefaultContextWindow,
      effectiveContextWindow: model.options.effectiveContextWindow,
      useToolCallMiddleware: model.options.useToolCallMiddleware,
      contentType: model.contentType,
    };
  }

  if (provider.kind === "ai-gateway") {
    return {
      id: model.id,
      type: "ai-gateway",
      modelId: model.modelId,
      apiKey: provider.apiKey,
      maxOutputTokens:
        model.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        model.options.contextWindow ?? constants.DefaultContextWindow,
      effectiveContextWindow: model.options.effectiveContextWindow,
      useToolCallMiddleware: model.options.useToolCallMiddleware,
      contentType: model.contentType,
    };
  }

  if (
    provider.kind === undefined ||
    provider.kind === "openai" ||
    provider.kind === "anthropic" ||
    provider.kind === "openai-responses"
  ) {
    return {
      id: model.id,
      type: provider.kind || "openai",
      modelId: model.modelId,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      maxOutputTokens:
        model.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        model.options.contextWindow ?? constants.DefaultContextWindow,
      effectiveContextWindow: model.options.effectiveContextWindow,
      useToolCallMiddleware: model.options.useToolCallMiddleware,
      contentType: model.contentType,
    };
  }

  return assertUnreachable(provider.kind);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
