// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShareData } from "./use-share-data";

describe("useShareData", () => {
  beforeEach(() => {
    window.history.replaceState(
      {},
      "",
      "/stores/store-1/tasks/task-1/html#token=owner-token",
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("refreshes share data when a store event is received", async () => {
    let eventsController:
      | ReadableStreamDefaultController<Uint8Array>
      | undefined;
    let jsonRequestCount = 0;
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/json")) {
        jsonRequestCount += 1;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              makeShareData(
                jsonRequestCount === 1 ? "invalid mermaid" : "fixed mermaid",
              ),
            ),
        } as Response);
      }
      if (url.endsWith("/events")) {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              eventsController = controller;
              init?.signal?.addEventListener(
                "abort",
                () => controller.close(),
                { once: true },
              );
            },
          }),
        } as Response);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, unmount } = renderHook(() =>
      useShareData({ isStorePathname: true }),
    );

    await waitFor(() => {
      expect(result.current?.messages?.[0]?.parts).toEqual([
        { type: "text", text: "invalid mermaid" },
      ]);
    });

    if (!eventsController) {
      throw new Error("Share events stream was not created");
    }
    eventsController.enqueue(
      encoder.encode('data: {"name":"v1.MermaidRepaired","args":{}}\n\n'),
    );

    await waitFor(() => {
      expect(result.current?.messages?.[0]?.parts).toEqual([
        { type: "text", text: "fixed mermaid" },
      ]);
    });

    const eventRequest = fetchMock.mock.calls.find(([input]) =>
      input.toString().endsWith("/events"),
    );
    expect(eventRequest?.[1]).toMatchObject({
      headers: { Authorization: "Bearer owner-token" },
    });

    const signal = (eventRequest?.[1] as RequestInit).signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});

function makeShareData(text: string) {
  return {
    type: "share" as const,
    messages: [
      {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text }],
      },
    ],
  };
}
