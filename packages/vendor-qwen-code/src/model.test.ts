import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQwenModel } from "./model";

const mocks = vi.hoisted(() => ({
  createOpenAICompatible: vi.fn(),
  wrapLanguageModel: vi.fn((value) => value),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.createOpenAICompatible,
}));

vi.mock("ai", () => ({
  APICallError: class APICallError extends Error {},
  wrapLanguageModel: mocks.wrapLanguageModel,
}));

describe("Qwen Code model", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("uses the shared CORS proxy fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    let qwenFetch: typeof fetch | undefined;
    vi.mocked(createOpenAICompatible).mockImplementation((options) => {
      qwenFetch = options.fetch;
      return ((modelId: string) => ({ modelId })) as ReturnType<
        typeof createOpenAICompatible
      >;
    });

    createQwenModel({
      modelId: "qwen3-coder-plus",
      getCredentials: async () => ({
        access_token: "token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
        resource_url: "https://portal.qwen.ai",
        expiry_date: Date.now() + 60_000,
      }),
    });

    await qwenFetch?.("https://portal.qwen.ai/v1/chat/completions", {
      method: "POST",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      new URL(
        "https://proxy.example/?url=https%3A%2F%2Fportal.qwen.ai%2Fv1%2Fchat%2Fcompletions",
      ),
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer token",
    );
  });
});
