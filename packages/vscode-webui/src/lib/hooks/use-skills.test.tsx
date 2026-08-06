// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { useSkills } from "./use-skills";

const vscodeMocks = vi.hoisted(() => ({
  readSkills: vi.fn(),
}));

vi.mock("../vscode", () => ({
  vscodeHost: { readSkills: vscodeMocks.readSkills },
}));

describe("useSkills", () => {
  it("stops loading and returns an empty list when reading skills fails", async () => {
    vscodeMocks.readSkills.mockRejectedValueOnce(new Error("read failed"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSkills(true), { wrapper });

    expect(result.current).toEqual({ skills: [], isLoading: true });
    await waitFor(() => {
      expect(result.current).toEqual({ skills: [], isLoading: false });
    });
  });
});
