import { describe, expect, it, vi } from "vitest";
import { getVirtualFileListRange } from "../file-list";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    openFile: vi.fn(),
  },
}));

describe("getVirtualFileListRange", () => {
  it("renders a small list without padding", () => {
    expect(
      getVirtualFileListRange({
        itemCount: 3,
        scrollTop: 0,
        viewportHeight: 100,
        rowHeight: 24,
        overscan: 4,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
      offsetTop: 0,
      totalHeight: 72,
    });
  });

  it("returns a scrolled virtual window without dropping later matches", () => {
    const result = getVirtualFileListRange({
      itemCount: 500,
      scrollTop: 4800,
      viewportHeight: 100,
      rowHeight: 24,
      overscan: 4,
    });

    expect(result.startIndex).toBe(196);
    expect(result.endIndex).toBe(209);
    expect(result.offsetTop).toBe(4704);
    expect(result.totalHeight).toBe(12000);
  });
});
