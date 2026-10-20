import { describe, expect, it } from "vitest";
import { getContentTypesForModel } from "./content-type";

describe("getContentTypesForModel", () => {
  it("supports the documented image formats for DeepSeek Flash", () => {
    expect(getContentTypesForModel("deepseek/deepseek-flash")).toEqual([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ]);
  });

  it.each([
    "deepseek/deepseek-4-pro",
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-r1",
    "deepseek/unknown-model",
    "deepseek/deepseek-flash-unknown",
    "other/deepseek/deepseek-flash",
  ])("does not enable media for unverified DeepSeek model %s", (modelId) => {
    expect(getContentTypesForModel(modelId)).toBeUndefined();
  });

  it.each([
    [
      "google/gemini-3.1-pro",
      ["image/png", "application/pdf", "video/mp4", "audio/wav"],
    ],
    [
      "anthropic/claude-5-sonnet",
      ["image/png", "image/gif", "application/pdf"],
    ],
    ["openai/gpt-5.6", ["image/png", "image/gif", "application/pdf"]],
  ])("preserves existing media support for %s", (modelId, contentTypes) => {
    expect(getContentTypesForModel(modelId)).toEqual(
      expect.arrayContaining(contentTypes),
    );
  });

  it.each([
    "zai/glm-5.2",
    "moonshotai/kimi-k2",
    "qwen/qwen3-coder",
    "unknown/model",
    "",
  ])(
    "does not enable media for other text-only or unknown models: %s",
    (modelId) => {
      expect(getContentTypesForModel(modelId)).toBeUndefined();
    },
  );
});
