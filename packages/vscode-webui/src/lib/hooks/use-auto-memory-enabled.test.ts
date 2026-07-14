// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useAutoMemoryEnabled } from "./use-auto-memory-enabled";
import { useQuery } from "@tanstack/react-query";

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

  it("should default to globalEnabled when override is undefined", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        value: {
          value: true,
        },
      },
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    expect(result.current.autoMemoryEnabled).toBe(true);
  });

  it("should default to true if globalEnabled data is not yet available", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    expect(result.current.autoMemoryEnabled).toBe(true);
  });

  it("should use local override state and override global value", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        value: {
          value: false,
        },
      },
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    // Initially inherits globalEnabled (false)
    expect(result.current.autoMemoryEnabled).toBe(false);

    // Override to true
    act(() => {
      result.current.setAutoMemoryEnabled?.(true);
    });

    expect(result.current.autoMemoryEnabled).toBe(true);

    // Override to false
    act(() => {
      result.current.setAutoMemoryEnabled?.(false);
    });

    expect(result.current.autoMemoryEnabled).toBe(false);
  });

  it("should have higher priority even if global is false", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: {
        value: {
          value: false,
        },
      },
    } as any);

    const { result } = renderHook(() => useAutoMemoryEnabled());

    expect(result.current.autoMemoryEnabled).toBe(false);

    act(() => {
      result.current.setAutoMemoryEnabled?.(true);
    });

    expect(result.current.autoMemoryEnabled).toBe(true);
  });
});
