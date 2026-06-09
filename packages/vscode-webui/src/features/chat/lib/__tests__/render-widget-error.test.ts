import { describe, expect, it } from "vitest";
import { mergeRenderWidgetError } from "../render-widget-error";

describe("mergeRenderWidgetError", () => {
  it("keeps internal errors above runtime errors regardless of order", () => {
    const internalError = {
      kind: "internal" as const,
      message: "Widget setup error.",
    };
    const runtimeError = {
      kind: "runtime" as const,
      message: "Invalid or unexpected token",
    };

    expect(mergeRenderWidgetError(internalError, runtimeError)).toBe(
      internalError,
    );
    expect(mergeRenderWidgetError(runtimeError, internalError)).toBe(
      internalError,
    );
  });

  it("keeps the latest error when priority is the same", () => {
    const firstRuntimeError = {
      kind: "runtime" as const,
      message: "First runtime error",
    };
    const secondRuntimeError = {
      kind: "runtime" as const,
      message: "Second runtime error",
    };

    expect(
      mergeRenderWidgetError(firstRuntimeError, secondRuntimeError),
    ).toBe(secondRuntimeError);
  });
});
