import { renderHook } from "@testing-library/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { describe, expect, it, vi } from "vitest";
import { useMentionKeyboardNavigation } from "../shared";

function keyDown(key: string) {
  return {
    event: new KeyboardEvent("keydown", { key }),
  } as SuggestionKeyDownProps;
}

describe("useMentionKeyboardNavigation", () => {
  it("leaves every key to the editor when the list is empty", () => {
    const { result } = renderHook(() =>
      useMentionKeyboardNavigation([], 0, vi.fn(), vi.fn()),
    );
    for (const key of ["Enter", "ArrowUp", "ArrowDown"]) {
      expect(result.current.onKeyDown(keyDown(key))).toBe(false);
    }
  });

  it("selects the current item on Enter", () => {
    const select = vi.fn();
    const { result } = renderHook(() =>
      useMentionKeyboardNavigation(["a", "b"], 1, vi.fn(), select),
    );
    expect(result.current.onKeyDown(keyDown("Enter"))).toBe(true);
    expect(select).toHaveBeenCalledWith("b");
  });
});
