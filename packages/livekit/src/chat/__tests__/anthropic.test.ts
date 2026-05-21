import { afterEach, describe, expect, it, vi } from "vitest";
import { proxiedFetch } from "../models/anthropic";

describe("Anthropic fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("uses direct fetch when the CORS proxy is not configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await proxiedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      { method: "POST" },
    );
  });

  it("uses the CORS proxy when configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    await proxiedFetch("https://api.anthropic.com/v1/messages", {
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
