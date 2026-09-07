// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskInputDraft } from "./use-task-input-draft";

const vscodeMocks = vi.hoisted(() => ({
  getState: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("../vscode", () => ({
  getVSCodeApi: () => vscodeMocks,
}));

describe("useTaskInputDraft", () => {
  beforeEach(() => {
    vscodeMocks.getState.mockReset();
    vscodeMocks.setState.mockReset();
    vscodeMocks.getState.mockReturnValue({});
  });

  it("omits pasted text data when persisting the editor draft", async () => {
    const { result } = renderHook(() => useTaskInputDraft());

    act(() => {
      result.current.setDraft({
        json: null,
        text: "instruction",
        pastedTexts: ["large pasted text"],
      });
    });

    await waitFor(() => {
      expect(vscodeMocks.setState).toHaveBeenLastCalledWith({
        taskInputDraft: {
          content: {
            json: null,
            text: "instruction",
          },
          timestamp: expect.any(Number),
        },
      });
    });
  });
});
