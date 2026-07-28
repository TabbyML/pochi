// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoMemoryEnabled } from "./use-auto-memory-enabled";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    readAutoMemoryEnabled: vi.fn(),
  },
}));

describe("useAutoMemoryEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the global setting", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        value: {
          value: false,
        },
        setAutoMemoryEnabled: vi.fn(),
      },
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    expect(result.current.autoMemoryEnabled).toBe(false);
  });

  it("defaults to true while the global setting is loading", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    expect(result.current.autoMemoryEnabled).toBe(true);
    expect(result.current.setAutoMemoryEnabled).toBeUndefined();
  });

  it("updates the global setting through the VS Code host", () => {
    const setAutoMemoryEnabled = vi.fn();
    vi.mocked(useQuery).mockReturnValue({
      data: {
        value: {
          value: true,
        },
        setAutoMemoryEnabled,
      },
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    result.current.setAutoMemoryEnabled?.(false);

    expect(setAutoMemoryEnabled).toHaveBeenCalledOnce();
    expect(setAutoMemoryEnabled).toHaveBeenCalledWith(false);
  });
});
