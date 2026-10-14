// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelAccess } from "./use-model-access";

const mocks = vi.hoisted(() => ({
  credentials: {
    token: "session-a" as string | null,
    sessionKey: "scope-a" as string | null,
    isPending: false,
  },
  fetch: vi.fn(),
}));

vi.mock("./use-pochi-credentials", () => ({
  usePochiCredentials: () => mocks.credentials,
}));
vi.mock("@getpochi/common/vscode-webui-bridge", () => ({
  getServerBaseUrl: () => "http://localhost:4113",
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  mocks.credentials = {
    token: "session-a",
    sessionKey: "scope-a",
    isPending: false,
  };
  mocks.fetch
    .mockReset()
    .mockResolvedValue(new Response(JSON.stringify({ superModels: true })));
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useModelAccess", () => {
  it("uses the session token and the server's access decision without a JWT", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useModelAccess(), { wrapper });

    await waitFor(() => expect(result.current.superModels).toBe(true));
    expect(mocks.fetch).toHaveBeenCalledWith(
      "http://localhost:4113/api/billing/model-access",
      expect.objectContaining({
        headers: { Authorization: "Bearer session-a" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ),
    ).not.toContain("session-a");
  });

  it("waits for the first access response", async () => {
    let resolve!: (response: Response) => void;
    mocks.fetch.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useModelAccess(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    await act(async () =>
      resolve(new Response(JSON.stringify({ superModels: false }))),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.superModels).toBe(false);
  });

  it("keeps the last successful decision when a refresh fails", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useModelAccess(), { wrapper });
    await waitFor(() => expect(result.current.superModels).toBe(true));
    mocks.fetch.mockRejectedValueOnce(new Error("network unavailable"));

    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.superModels).toBe(true);
  });

  it("refreshes access immediately when explicitly requested", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useModelAccess(), { wrapper });
    await waitFor(() => expect(result.current.superModels).toBe(true));
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ superModels: false })),
    );

    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.superModels).toBe(false));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])(
    "clears access when the server rejects authentication with %s",
    async (status) => {
      const { wrapper } = setup();
      const { result } = renderHook(() => useModelAccess(), { wrapper });
      await waitFor(() => expect(result.current.superModels).toBe(true));
      mocks.fetch.mockResolvedValueOnce(new Response(null, { status }));

      await act(async () => {
        await result.current.refetch();
      });
      await waitFor(() => expect(result.current.superModels).toBe(false));
    },
  );

  it("does not carry access across sessions or keep it after logout", async () => {
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook(() => useModelAccess(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.superModels).toBe(true));
    mocks.credentials = {
      token: "session-b",
      sessionKey: "scope-b",
      isPending: false,
    };
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ superModels: false })),
    );
    rerender();
    expect(result.current.superModels).toBe(false);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mocks.credentials = { token: null, sessionKey: null, isPending: false };
    rerender();
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.superModels).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .getAll()
          .some(
            (q) =>
              q.queryKey.includes("scope-a") || q.queryKey.includes("scope-b"),
          ),
      ).toBe(false),
    );
  });

  it("does not grant access from an invalid response", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ superModels: "true" })),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useModelAccess(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.superModels).toBe(false);
  });
});
