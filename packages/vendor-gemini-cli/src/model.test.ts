import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetcher } from "./model";

describe("Gemini CLI fetcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("uses direct fetch when CORS is requested but the proxy is not configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("data: {}\r\n\r\n"));
    vi.stubGlobal("fetch", fetchMock);

    const fetcher = createFetcher(
      "gemini-2.5-pro",
      async () => ({
        accessToken: "token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60_000,
        project: "project-id",
      }),
      true,
    );

    await fetcher("https://unused.example", {
      body: JSON.stringify({ contents: [] }),
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      new URL(
        "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
      ),
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer token",
    );
  });

  it("uses the CORS proxy when configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("data: {}\r\n\r\n"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    const fetcher = createFetcher(
      "gemini-2.5-pro",
      async () => ({
        accessToken: "token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 60_000,
        project: "project-id",
      }),
      true,
    );

    await fetcher("https://unused.example", {
      body: JSON.stringify({ contents: [] }),
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      new URL(
        "https://proxy.example/?url=https%3A%2F%2Fcloudcode-pa.googleapis.com%2Fv1internal%3AstreamGenerateContent%3Falt%3Dsse",
      ),
    );
  });
});
