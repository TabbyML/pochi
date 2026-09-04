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

  it("returns reactive running controls and a finished state", async () => {
    const state = signal<
      { status: "running"; isVisible: boolean } | { status: "finished" }
    >({ status: "running", isVisible: false });
    const show = vi.fn();
    const hide = vi.fn();
    const close = vi.fn();
    vi.mocked(useQuery).mockReturnValue({
      data: {
        state,
        show,
        hide,
        close,
      },
    } as never);

    const { result } = renderHook(() => useBackgroundCommand("bgjob-cmd-1"));

    expect(result.current.status).toBe("running");
    expect(result.current.isVisible).toBe(false);

    act(() => {
      state.value = { status: "running", isVisible: true };
    });
    expect(result.current.isVisible).toBe(true);

    await act(async () => result.current.show?.());
    await act(async () => result.current.hide?.());
    await act(async () => result.current.close?.());

    expect(show).toHaveBeenCalledOnce();
    expect(hide).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();

    act(() => {
      state.value = { status: "finished" };
    });

    expect(result.current.status).toBe("finished");
    expect(result.current.isVisible).toBe(false);
    expect(result.current.show).toBeUndefined();
    expect(result.current.hide).toBeUndefined();
    expect(result.current.close).toBeUndefined();
  });

  it("returns undefined state while the command is loading", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useBackgroundCommand("bgjob-cmd-1"));

    expect(result.current.status).toBeUndefined();
    expect(result.current.isVisible).toBeUndefined();
    expect(result.current.show).toBeUndefined();
    expect(result.current.hide).toBeUndefined();
    expect(result.current.close).toBeUndefined();
  });
});
