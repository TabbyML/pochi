import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithCorsProxy, withCorsProxy } from "../fetch-utils";

describe("fetch utils", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("returns the original input when the CORS proxy is not configured", () => {
    const url = new URL("https://example.com/api");

    expect(withCorsProxy(url)).toBe(url);
  });

  it("wraps URL input when the CORS proxy is configured", () => {
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    expect(withCorsProxy(new URL("https://example.com/api"))).toEqual(
      new URL("https://proxy.example/?url=https%3A%2F%2Fexample.com%2Fapi"),
    );
  });

  it("uses the original URL for Request input", () => {
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    expect(withCorsProxy(new Request("https://example.com/api"))).toEqual(
      new URL("https://proxy.example/?url=https%3A%2F%2Fexample.com%2Fapi"),
    );
  });

  it("fetches direct input when the CORS proxy is not configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithCorsProxy("https://api.example.com/messages", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/messages", {
      method: "POST",
    });
  });

  it("fetches through the CORS proxy when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    await fetchWithCorsProxy("https://api.example.com/messages", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://proxy.example/?url=https%3A%2F%2Fapi.example.com%2Fmessages",
      ),
      { method: "POST" },
    );
  });
});
