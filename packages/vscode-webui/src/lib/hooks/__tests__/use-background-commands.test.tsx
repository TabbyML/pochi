// @vitest-environment jsdom

import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBackgroundCommands } from "../use-background-commands";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("../../vscode", () => ({
  vscodeHost: {
    readBackgroundCommands: vi.fn(),
  },
}));

describe("useBackgroundCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all running commands and controls them by id", async () => {
    const backgroundCommands = signal<BackgroundCommands>({
      "bgjob-cmd-1": { isVisible: false },
      "bgjob-cmd-2": { isVisible: true },
    });
    const show = vi.fn();
    const hide = vi.fn();
    const close = vi.fn();
    vi.mocked(useQuery).mockReturnValue({
      data: {
        backgroundCommands,
        show,
        hide,
        close,
      },
    } as never);

    const { result } = renderHook(() => useBackgroundCommands());

    expect(result.current.backgroundCommands).toEqual({
      "bgjob-cmd-1": { isVisible: false },
      "bgjob-cmd-2": { isVisible: true },
    });

    act(() => {
      backgroundCommands.value = {
        "bgjob-cmd-2": { isVisible: false },
      };
    });
    expect(result.current.backgroundCommands).toEqual({
      "bgjob-cmd-2": { isVisible: false },
    });

    await act(async () => result.current.show?.("bgjob-cmd-2"));
    await act(async () => result.current.hide?.("bgjob-cmd-2"));
    await act(async () => result.current.close?.("bgjob-cmd-2"));

    expect(show).toHaveBeenCalledWith("bgjob-cmd-2");
    expect(hide).toHaveBeenCalledWith("bgjob-cmd-2");
    expect(close).toHaveBeenCalledWith("bgjob-cmd-2");
  });

  it("returns undefined state while commands are loading", () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined } as never);

    const { result } = renderHook(() => useBackgroundCommands());

    expect(result.current.backgroundCommands).toBeUndefined();
    expect(result.current.show).toBeUndefined();
    expect(result.current.hide).toBeUndefined();
    expect(result.current.close).toBeUndefined();
  });
});
