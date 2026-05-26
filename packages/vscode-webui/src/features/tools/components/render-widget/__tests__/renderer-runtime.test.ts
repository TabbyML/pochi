// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getWidgetRevealDelayMs } from "../renderer-runtime";

describe("render widget renderer runtime", () => {
  it("uses a compact reveal stagger while allowing long diagrams to keep revealing", () => {
    expect(getWidgetRevealDelayMs(0)).toBe(0);
    expect(getWidgetRevealDelayMs(1)).toBe(80);
    expect(getWidgetRevealDelayMs(5)).toBe(400);
    expect(getWidgetRevealDelayMs(75)).toBe(6000);
    expect(getWidgetRevealDelayMs(99)).toBe(6000);
  });
});
