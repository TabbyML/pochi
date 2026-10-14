// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePochiCredentials } from "./use-pochi-credentials";

const mocks = vi.hoisted(() => ({
  readCredentials: vi.fn(),
  userStorage: { users: { pochi: { email: "user@example.com" } } },
}));

vi.mock("../vscode", () => ({
  vscodeHost: { readPochiCredentials: mocks.readCredentials },
}));
vi.mock("./use-user-storage", () => ({
  useUserStorage: () => mocks.userStorage,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("usePochiCredentials session scope", () => {
  it("uses a stable, non-secret scope that changes when the session token changes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    mocks.readCredentials.mockResolvedValue({ token: "session-a", jwt: null });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => usePochiCredentials(), { wrapper });
    await waitFor(() => expect(result.current.token).toBe("session-a"));
    const scope = result.current.sessionKey;
    expect(scope).toMatch(/^[a-f0-9]{64}$/);
    expect(scope).not.toContain("session-a");

    await act(async () => {
      await client.invalidateQueries({ queryKey: ["pochiCredentials"] });
    });
    expect(result.current.sessionKey).toBe(scope);

    mocks.readCredentials.mockResolvedValue({ token: "session-b", jwt: null });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["pochiCredentials"] });
    });
    await waitFor(() => expect(result.current.token).toBe("session-b"));
    expect(result.current.sessionKey).not.toBe(scope);

    mocks.readCredentials.mockResolvedValue(null);
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["pochiCredentials"] });
    });
    await waitFor(() => expect(result.current.token).toBeNull());
    expect(result.current.sessionKey).toBeNull();
  });
});
