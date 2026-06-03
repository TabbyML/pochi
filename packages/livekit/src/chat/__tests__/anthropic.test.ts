import { createAnthropic } from "@ai-sdk/anthropic";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicModel } from "../models/anthropic";

const mocks = vi.hoisted(() => ({
  createAnthropic: vi.fn(),
  wrapLanguageModel: vi.fn((value) => value),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic,
}));

vi.mock("ai", () => ({
  wrapLanguageModel: mocks.wrapLanguageModel,
}));

describe("Anthropic model", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("uses the shared CORS proxy fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    let anthropicFetch: typeof fetch | undefined;
    vi.mocked(createAnthropic).mockImplementation((options) => {
      if (!options?.fetch) {
        throw new Error("Expected Anthropic fetch option");
      }
      anthropicFetch = options.fetch;
      return ((modelId: string) => ({ modelId })) as ReturnType<
        typeof createAnthropic
      >;
    });

    createAnthropicModel({
      id: "anthropic",
      type: "anthropic",
      modelId: "claude-sonnet-4-5",
      contextWindow: 200_000,
      maxOutputTokens: 8192,
    });

    await anthropicFetch?.("https://api.anthropic.com/v1/messages", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://proxy.example/?url=https%3A%2F%2Fapi.anthropic.com%2Fv1%2Fmessages",
      ),
      { method: "POST" },
    );
  });
});
