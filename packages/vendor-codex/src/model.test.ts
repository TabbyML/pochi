import { afterEach, describe, expect, it, vi } from "vitest";
import { createProxyFetch } from "./model";

describe("Codex proxy fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("uses direct fetch when the CORS proxy is not configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const proxyFetch = createProxyFetch(async () => ({
      accessToken: "token",
      mode: "chatgpt",
    }));

    await proxyFetch("https://chatgpt.com/backend-api/codex/responses", {
      body: JSON.stringify({ model: "gpt-5", input: [] }),
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer token",
    );
  });

  it("uses the CORS proxy when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    const proxyFetch = createProxyFetch(async () => ({
      accessToken: "token",
      mode: "chatgpt",
    }));

    await proxyFetch("https://chatgpt.com/backend-api/codex/responses", {
      body: JSON.stringify({ model: "gpt-5", input: [] }),
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      new URL(
        "https://proxy.example/?url=https%3A%2F%2Fchatgpt.com%2Fbackend-api%2Fcodex%2Fresponses",
      ),
    );
  });
});
