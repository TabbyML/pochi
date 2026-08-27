// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "../scroll-area";

// KaTeX renders its MathML fallback as `position: absolute`. Such content is
// laid out against the nearest positioned ancestor, so the scroll area root
// must clip it and the viewport must be the containing block; otherwise the
// escaped content becomes scrollable overflow on the root and the chat grows a
// second scrollbar with a large empty area at the bottom.
describe("ScrollArea", () => {
  it("keeps the root from becoming a scroll owner", () => {
    const { container } = render(
      <ScrollArea className="flex-1">content</ScrollArea>,
    );

    const root = container.querySelector('[data-slot="scroll-area"]');
    const classes = root?.className.split(/\s+/) ?? [];

    expect(classes).toContain("overflow-hidden");
    expect(
      classes.some((name) => /^overflow(-[xy])?-(auto|scroll)$/.test(name)),
    ).toBe(false);
  });

  it("makes the viewport the containing block for absolute content", () => {
    const { container } = render(<ScrollArea>content</ScrollArea>);

    const viewport = container.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );

    expect(viewport?.className.split(/\s+/)).toContain("relative");
  });
});
