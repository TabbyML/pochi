// @vitest-environment jsdom

import { signal } from "@preact/signals-core";
import { useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBackgroundCommand } from "../use-background-command";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../../vscode", () => ({
  vscodeHost: {
    readBackgroundCommand: vi.fn(),
  },
}));

describe("useBackgroundCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reactive visibility and background command controls", async () => {
    const isVisible = signal(false);
    const show = vi.fn();
    const hide = vi.fn();
    const close = vi.fn();
    vi.mocked(useQuery).mockReturnValue({
      data: {
        isVisible,
        show,
        hide,
        close,
      },
    } as never);

    const { result } = renderHook(() => useBackgroundCommand("bgjob-cmd-1"));

    expect(result.current.isVisible).toBe(false);

    act(() => {
      isVisible.value = true;
    });
    expect(result.current.isVisible).toBe(true);

    await act(async () => result.current.show?.());
    await act(async () => result.current.hide?.());
    await act(async () => result.current.close?.());

    expect(show).toHaveBeenCalledOnce();
    expect(hide).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns undefined state while the command is loading", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useBackgroundCommand("bgjob-cmd-1"));

    expect(result.current.isVisible).toBeUndefined();
    expect(result.current.show).toBeUndefined();
    expect(result.current.hide).toBeUndefined();
    expect(result.current.close).toBeUndefined();
  });
});
